import { LARGO_MAXIMO_DETALLE, TIPOS_GASTO } from '../catalogos.ts';
import { ahoraISO, auditar, type Deps, exigir, exigirAccesoCartera, hoy, type Sesion } from '../contexto.ts';
import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { conflicto, noEncontrado, solicitudInvalida } from '../errores.ts';
import { esFechaValida, diasEntre } from '../tiempo.ts';
import { exigirDiaAbierto } from './dias.ts';

export interface Gasto {
  id: number;
  tipo: string;
  valor: number;
  detalle: string;
  fecha: string;
  creadoEn: string;
  usuario: string;
}

function validarGasto(d: { tipo: string; valor: number; detalle?: string }): { tipo: string; valor: number; detalle: string } {
  if (!(TIPOS_GASTO as readonly string[]).includes(d.tipo)) throw solicitudInvalida('Tipo de gasto no permitido', 'TIPO_GASTO_INVALIDO');
  if (!Number.isInteger(d.valor) || d.valor < 1) throw solicitudInvalida('El valor del gasto debe ser un entero positivo', 'VALOR_INVALIDO');
  const detalle = (d.detalle ?? '').trim();
  if (detalle.length > LARGO_MAXIMO_DETALLE) throw solicitudInvalida(`El detalle admite hasta ${LARGO_MAXIMO_DETALLE} caracteres`, 'DETALLE_LARGO');
  return { tipo: d.tipo, valor: d.valor, detalle };
}

export function registrarGasto(deps: Deps, sesion: Sesion, carteraId: number, datos: { tipo: string; valor: number; detalle?: string }): { id: number } {
  exigir(sesion, 'gastos.crear');
  const g = validarGasto(datos);
  return transaccion(deps.db, () => {
    const fecha = exigirDiaAbierto(deps, carteraId);
    const { id } = ejecutar(
      deps.db,
      'INSERT INTO gastos (empresa_id, cartera_id, tipo, valor, detalle, fecha, creado_en, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      sesion.empresaId,
      carteraId,
      g.tipo,
      g.valor,
      g.detalle,
      fecha,
      ahoraISO(deps),
      sesion.usuarioId,
    );
    auditar(deps, sesion, 'gasto.registrar', 'gasto', id, { tipo: g.tipo, valor: g.valor });
    return { id };
  });
}

export function consultarGastos(
  deps: Deps,
  sesion: Sesion,
  carteraId: number,
  desde: string,
  hasta: string,
): { desde: string; hasta: string; total: number; items: Gasto[] } {
  exigir(sesion, 'gastos.ver');
  if (!esFechaValida(desde) || !esFechaValida(hasta)) throw solicitudInvalida('Las fechas deben tener formato AAAA-MM-DD', 'FECHA_INVALIDA');
  if (desde > hasta) throw solicitudInvalida('La fecha inicial no puede ser posterior a la final', 'RANGO_INVALIDO');
  if (diasEntre(desde, hasta) > 366) throw solicitudInvalida('El rango máximo de consulta es de un año', 'RANGO_INVALIDO');
  const items = todos<{ id: number; tipo: string; valor: number; detalle: string; fecha: string; creado_en: string; usuario: string }>(
    deps.db,
    `SELECT g.id, g.tipo, g.valor, g.detalle, g.fecha, g.creado_en, u.nombre AS usuario
     FROM gastos g JOIN usuarios u ON u.id = g.usuario_id
     WHERE g.cartera_id = ? AND g.anulado = 0 AND g.fecha BETWEEN ? AND ?
     ORDER BY g.fecha, g.creado_en, g.id`,
    carteraId,
    desde,
    hasta,
  ).map((g) => ({ id: g.id, tipo: g.tipo, valor: g.valor, detalle: g.detalle, fecha: g.fecha, creadoEn: g.creado_en, usuario: g.usuario }));
  return { desde, hasta, total: items.reduce((s, g) => s + g.valor, 0), items };
}

interface FilaGasto {
  id: number;
  cartera_id: number;
  fecha: string;
  anulado: number;
}

function cargarGastoModificable(deps: Deps, sesion: Sesion, id: number): FilaGasto {
  const g = uno<FilaGasto>(deps.db, 'SELECT id, cartera_id, fecha, anulado FROM gastos WHERE id = ? AND empresa_id = ?', id, sesion.empresaId);
  if (!g) throw noEncontrado('Gasto');
  exigirAccesoCartera(sesion, g.cartera_id, 'Gasto');
  if (g.anulado === 1) throw conflicto('GASTO_ANULADO', 'El gasto ya está anulado');
  exigirDiaAbierto(deps, g.cartera_id);
  if (g.fecha !== hoy(deps)) throw conflicto('DIA_CERRADO', 'Solo se pueden modificar gastos registrados el día de hoy');
  return g;
}

export function editarGasto(deps: Deps, sesion: Sesion, id: number, datos: { tipo: string; valor: number; detalle?: string }): void {
  exigir(sesion, 'gastos.editar');
  const g = validarGasto(datos);
  transaccion(deps.db, () => {
    cargarGastoModificable(deps, sesion, id);
    ejecutar(deps.db, 'UPDATE gastos SET tipo = ?, valor = ?, detalle = ? WHERE id = ?', g.tipo, g.valor, g.detalle, id);
    auditar(deps, sesion, 'gasto.editar', 'gasto', id, g);
  });
}

export function anularGasto(deps: Deps, sesion: Sesion, id: number): void {
  exigir(sesion, 'gastos.editar');
  transaccion(deps.db, () => {
    cargarGastoModificable(deps, sesion, id);
    ejecutar(deps.db, 'UPDATE gastos SET anulado = 1 WHERE id = ?', id);
    auditar(deps, sesion, 'gasto.anular', 'gasto', id);
  });
}
