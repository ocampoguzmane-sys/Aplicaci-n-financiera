import { FORMAS_PAGO, type FormaPago } from '../catalogos.ts';
import { cuotasPagadas } from '../credito.ts';
import { ahoraISO, auditar, type Deps, exigir, exigirAccesoCartera, hoy, type Sesion } from '../contexto.ts';
import { ejecutar, transaccion, uno } from '../db.ts';
import { conflicto, noEncontrado, solicitudInvalida } from '../errores.ts';
import { cargarCredito, recalcularEstado, totalAbonos } from './creditos.ts';
import { exigirDiaAbierto } from './dias.ts';

const LARGO_MAXIMO_NOTA = 200;

function validarValor(valor: number): void {
  if (!Number.isInteger(valor) || valor < 1) throw solicitudInvalida('El valor del pago debe ser un entero positivo', 'VALOR_INVALIDO');
}

function validarForma(forma: string): asserts forma is FormaPago {
  if (!(FORMAS_PAGO as readonly string[]).includes(forma)) throw solicitudInvalida('Forma de pago inválida (EF o TR)', 'FORMA_INVALIDA');
}

export interface ResultadoPago {
  pagoId: number;
  creditoId: number;
  valor: number;
  forma: FormaPago;
  saldo: number;
  cuotasPagadas: number;
  creditoEstado: 'VIGENTE' | 'PAGADO' | 'ANULADO';
  mensaje: string;
}

function resultado(deps: Deps, creditoId: number, pagoId: number, valor: number, forma: FormaPago, mensaje: string): ResultadoPago {
  const k = uno<{ total: number; valor_cuota: number; estado: ResultadoPago['creditoEstado'] }>(
    deps.db,
    'SELECT total, valor_cuota, estado FROM creditos WHERE id = ?',
    creditoId,
  ) as { total: number; valor_cuota: number; estado: ResultadoPago['creditoEstado'] };
  const abonos = totalAbonos(deps, creditoId);
  return { pagoId, creditoId, valor, forma, saldo: k.total - abonos, cuotasPagadas: cuotasPagadas(abonos, k.valor_cuota), creditoEstado: k.estado, mensaje };
}

export function registrarPago(
  deps: Deps,
  sesion: Sesion,
  creditoId: number,
  datos: { valor: number; forma: string; nota?: string },
): ResultadoPago {
  exigir(sesion, 'pagos.crear');
  validarValor(datos.valor);
  validarForma(datos.forma);
  const nota = datos.nota?.trim();
  if (nota && nota.length > LARGO_MAXIMO_NOTA) throw solicitudInvalida(`La nota admite hasta ${LARGO_MAXIMO_NOTA} caracteres`, 'NOTA_LARGA');
  const forma: FormaPago = datos.forma;
  return transaccion(deps.db, () => {
    const k = cargarCredito(deps, sesion, creditoId);
    const fecha = exigirDiaAbierto(deps, k.cartera_id);
    if (k.estado !== 'VIGENTE') throw conflicto('CREDITO_NO_VIGENTE', 'El crédito no está vigente');
    const saldo = k.total - totalAbonos(deps, creditoId);
    if (datos.valor > saldo) throw conflicto('PAGO_EXCEDE_SALDO', `El pago supera el saldo del crédito (${saldo})`);
    const { id } = ejecutar(
      deps.db,
      'INSERT INTO pagos (empresa_id, cartera_id, credito_id, valor, forma, fecha, creado_en, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      sesion.empresaId,
      k.cartera_id,
      creditoId,
      datos.valor,
      forma,
      fecha,
      ahoraISO(deps),
      sesion.usuarioId,
    );
    recalcularEstado(deps, creditoId);
    if (nota) {
      ejecutar(
        deps.db,
        'INSERT INTO notas (empresa_id, cartera_id, credito_id, cliente_id, texto, fecha, creado_en, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        sesion.empresaId,
        k.cartera_id,
        creditoId,
        k.cliente_id,
        nota,
        fecha,
        ahoraISO(deps),
        sesion.usuarioId,
      );
    }
    auditar(deps, sesion, 'pago.registrar', 'pago', id, { creditoId, valor: datos.valor, forma });
    const nuevoSaldo = saldo - datos.valor;
    return resultado(deps, creditoId, id, datos.valor, forma, `Pago de CUOTA registrado por valor de ${datos.valor}. Su nuevo saldo es de ${nuevoSaldo}`);
  });
}

interface FilaPago {
  id: number;
  cartera_id: number;
  credito_id: number;
  valor: number;
  forma: FormaPago;
  fecha: string;
  anulado: number;
}

/** Un pago solo se puede modificar el mismo día en que se registró, con el día abierto. */
function cargarPagoModificable(deps: Deps, sesion: Sesion, pagoId: number): FilaPago {
  const p = uno<FilaPago>(deps.db, 'SELECT id, cartera_id, credito_id, valor, forma, fecha, anulado FROM pagos WHERE id = ? AND empresa_id = ?', pagoId, sesion.empresaId);
  if (!p) throw noEncontrado('Pago');
  exigirAccesoCartera(sesion, p.cartera_id, 'Pago');
  if (p.anulado === 1) throw conflicto('PAGO_ANULADO', 'El pago ya está anulado');
  exigirDiaAbierto(deps, p.cartera_id);
  if (p.fecha !== hoy(deps)) throw conflicto('DIA_CERRADO', 'Solo se pueden modificar pagos registrados el día de hoy');
  return p;
}

export function editarPago(deps: Deps, sesion: Sesion, pagoId: number, cambios: { valor?: number; forma?: string }): ResultadoPago {
  exigir(sesion, 'pagos.editar');
  if (cambios.valor === undefined && cambios.forma === undefined) throw solicitudInvalida('No hay cambios que aplicar', 'SIN_CAMBIOS');
  if (cambios.valor !== undefined) validarValor(cambios.valor);
  if (cambios.forma !== undefined) validarForma(cambios.forma);
  return transaccion(deps.db, () => {
    const p = cargarPagoModificable(deps, sesion, pagoId);
    const k = cargarCredito(deps, sesion, p.credito_id);
    if (k.estado === 'ANULADO') throw conflicto('CREDITO_ANULADO', 'El crédito está anulado');
    const valor = cambios.valor ?? p.valor;
    const forma = (cambios.forma ?? p.forma) as FormaPago;
    const saldoSinEstePago = k.total - (totalAbonos(deps, k.id) - p.valor);
    if (valor > saldoSinEstePago) throw conflicto('PAGO_EXCEDE_SALDO', `El pago supera el saldo del crédito (${saldoSinEstePago})`);
    ejecutar(deps.db, 'UPDATE pagos SET valor = ?, forma = ?, modificado = 1, modificado_por = ?, modificado_en = ? WHERE id = ?', valor, forma, sesion.usuarioId, ahoraISO(deps), pagoId);
    recalcularEstado(deps, k.id);
    auditar(deps, sesion, 'pago.editar', 'pago', pagoId, { antes: { valor: p.valor, forma: p.forma }, despues: { valor, forma } });
    return resultado(deps, k.id, pagoId, valor, forma, 'Pago modificado');
  });
}

export function anularPago(deps: Deps, sesion: Sesion, pagoId: number): ResultadoPago {
  exigir(sesion, 'pagos.editar');
  return transaccion(deps.db, () => {
    const p = cargarPagoModificable(deps, sesion, pagoId);
    ejecutar(deps.db, 'UPDATE pagos SET anulado = 1, modificado = 1, modificado_por = ?, modificado_en = ? WHERE id = ?', sesion.usuarioId, ahoraISO(deps), pagoId);
    recalcularEstado(deps, p.credito_id);
    auditar(deps, sesion, 'pago.anular', 'pago', pagoId, { valor: p.valor, forma: p.forma });
    return resultado(deps, p.credito_id, pagoId, p.valor, p.forma, 'Pago anulado');
  });
}
