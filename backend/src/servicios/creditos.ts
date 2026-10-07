import { buscarPeriodo, CUOTAS, UTILIDADES } from '../catalogos.ts';
import { calcularCronograma, cuotasPagadas } from '../credito.ts';
import { ahoraISO, auditar, type Deps, exigir, exigirAccesoCartera, hoy, patronBusqueda, type Sesion } from '../contexto.ts';
import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { conflicto, noEncontrado, solicitudInvalida } from '../errores.ts';
import { exigirDiaAbierto } from './dias.ts';

export interface DatosVenta {
  valorArticulo: number;
  utilidad: number;
  cuotas: number;
  periodo: string;
}

export interface FilaCredito {
  id: number;
  empresa_id: number;
  cartera_id: number;
  cliente_id: number;
  capital: number;
  tasa: number;
  cuotas: number;
  valor_cuota: number;
  interes: number;
  total: number;
  periodo: string;
  fecha: string;
  primera_cuota: string;
  vence: string;
  estado: 'VIGENTE' | 'PAGADO' | 'ANULADO';
  creado_por: number;
  creado_en: string;
}

export function validarVenta(d: DatosVenta): void {
  if (!Number.isInteger(d.valorArticulo) || d.valorArticulo < 1) throw solicitudInvalida('El valor del artículo debe ser un entero positivo', 'VALOR_INVALIDO');
  if (!(UTILIDADES as readonly number[]).includes(d.utilidad)) throw solicitudInvalida('Utilidad no permitida', 'UTILIDAD_INVALIDA');
  if (!(CUOTAS as readonly number[]).includes(d.cuotas)) throw solicitudInvalida('Número de cuotas no permitido', 'CUOTAS_INVALIDAS');
  if (!buscarPeriodo(d.periodo)) throw solicitudInvalida('Periodo no permitido', 'PERIODO_INVALIDO');
}

export interface CreditoCreado {
  id: number;
  capital: number;
  tasa: number;
  interes: number;
  total: number;
  cuotas: number;
  valorCuota: number;
  periodo: string;
  fecha: string;
  primeraCuota: string;
  vence: string;
}

/** Inserta el crédito. El llamador debe estar dentro de una transacción y haber verificado permisos y día abierto. */
export function insertarCredito(
  deps: Deps,
  sesion: Sesion,
  cliente: { id: number; empresa_id: number; cartera_id: number },
  d: DatosVenta,
  fecha: string,
): CreditoCreado {
  validarVenta(d);
  const c = calcularCronograma(d.valorArticulo, d.utilidad, d.cuotas, d.periodo, fecha);
  const { id } = ejecutar(
    deps.db,
    `INSERT INTO creditos (empresa_id, cartera_id, cliente_id, capital, tasa, cuotas, valor_cuota, interes, total, periodo, fecha, primera_cuota, vence, creado_por, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    cliente.empresa_id,
    cliente.cartera_id,
    cliente.id,
    d.valorArticulo,
    d.utilidad,
    d.cuotas,
    c.valorCuota,
    c.interes,
    c.total,
    d.periodo,
    fecha,
    c.primeraCuota,
    c.vence,
    sesion.usuarioId,
    ahoraISO(deps),
  );
  auditar(deps, sesion, 'credito.crear', 'credito', id, { clienteId: cliente.id, capital: d.valorArticulo, tasa: d.utilidad, cuotas: d.cuotas, periodo: d.periodo });
  return { id, capital: d.valorArticulo, tasa: d.utilidad, interes: c.interes, total: c.total, cuotas: d.cuotas, valorCuota: c.valorCuota, periodo: d.periodo, fecha, primeraCuota: c.primeraCuota, vence: c.vence };
}

export function vender(deps: Deps, sesion: Sesion, clienteId: number, d: DatosVenta): CreditoCreado {
  exigir(sesion, 'creditos.vender');
  return transaccion(deps.db, () => {
    const cliente = uno<{ id: number; empresa_id: number; cartera_id: number }>(
      deps.db,
      'SELECT id, empresa_id, cartera_id FROM clientes WHERE id = ? AND empresa_id = ?',
      clienteId,
      sesion.empresaId,
    );
    if (!cliente) throw noEncontrado('Cliente');
    exigirAccesoCartera(sesion, cliente.cartera_id, 'Cliente');
    const fecha = exigirDiaAbierto(deps, cliente.cartera_id);
    return insertarCredito(deps, sesion, cliente, d, fecha);
  });
}

/** Marca el crédito como PAGADO o VIGENTE según los abonos válidos. */
export function recalcularEstado(deps: Deps, creditoId: number): void {
  const k = uno<{ total: number; estado: string }>(deps.db, 'SELECT total, estado FROM creditos WHERE id = ?', creditoId);
  if (!k || k.estado === 'ANULADO') return;
  const abonos = totalAbonos(deps, creditoId);
  ejecutar(deps.db, 'UPDATE creditos SET estado = ? WHERE id = ?', abonos >= k.total ? 'PAGADO' : 'VIGENTE', creditoId);
}

export function totalAbonos(deps: Deps, creditoId: number): number {
  return uno<{ s: number }>(deps.db, 'SELECT COALESCE(SUM(valor), 0) AS s FROM pagos WHERE credito_id = ? AND anulado = 0', creditoId)?.s ?? 0;
}

export function cargarCredito(deps: Deps, sesion: Sesion, id: number): FilaCredito {
  const k = uno<FilaCredito>(deps.db, 'SELECT * FROM creditos WHERE id = ? AND empresa_id = ?', id, sesion.empresaId);
  if (!k) throw noEncontrado('Crédito');
  exigirAccesoCartera(sesion, k.cartera_id, 'Crédito');
  return k;
}

// ---------------------------------------------------------------- listados

export interface CreditoVigente {
  id: number;
  clienteId: number;
  cliente: string;
  valorCredito: number;
  saldo: number;
  valorCuota: number;
  nPagos: number;
  cuotasPagadas: number;
  periodo: string;
  fecha: string;
  vence: string;
  ultimoPago: string | null;
}

export function listarVigentes(deps: Deps, sesion: Sesion, carteraId: number, busqueda?: string): { creditosVigentes: number; items: CreditoVigente[] } {
  exigir(sesion, 'creditos.ver');
  const q = busqueda?.trim();
  const filas = todos<{
    id: number;
    cliente_id: number;
    nombres: string;
    apellidos: string;
    total: number;
    valor_cuota: number;
    periodo: string;
    creado_en: string;
    vence: string;
    abonos: number;
    n_pagos: number;
    ultimo_pago: string | null;
  }>(
    deps.db,
    `SELECT k.id, k.cliente_id, c.nombres, c.apellidos, k.total, k.valor_cuota, k.periodo, k.creado_en, k.vence,
            COALESCE((SELECT SUM(p.valor) FROM pagos p WHERE p.credito_id = k.id AND p.anulado = 0), 0) AS abonos,
            (SELECT COUNT(*) FROM pagos p WHERE p.credito_id = k.id AND p.anulado = 0) AS n_pagos,
            (SELECT MAX(p.creado_en) FROM pagos p WHERE p.credito_id = k.id AND p.anulado = 0) AS ultimo_pago
     FROM creditos k
     JOIN clientes c ON c.id = k.cliente_id
     JOIN carteras r ON r.id = k.cartera_id
     WHERE k.cartera_id = ? AND k.estado = 'VIGENTE'
       AND (? IS NULL OR (c.nombres || ' ' || c.apellidos LIKE ? ESCAPE '\\' OR c.identificacion LIKE ? ESCAPE '\\'))
     ORDER BY CASE WHEN r.orden_modo = 'PERSONALIZADO' THEN c.orden END, c.nombres COLLATE NOCASE, c.apellidos COLLATE NOCASE, k.id`,
    carteraId,
    q ? q : null,
    q ? patronBusqueda(q) : null,
    q ? patronBusqueda(q) : null,
  );
  const items = filas.map((f) => ({
    id: f.id,
    clienteId: f.cliente_id,
    cliente: `${f.nombres} ${f.apellidos}`,
    valorCredito: f.total,
    saldo: f.total - f.abonos,
    valorCuota: f.valor_cuota,
    nPagos: f.n_pagos,
    cuotasPagadas: cuotasPagadas(f.abonos, f.valor_cuota),
    periodo: f.periodo,
    fecha: f.creado_en,
    vence: f.vence,
    ultimoPago: f.ultimo_pago,
  }));
  return { creditosVigentes: items.length, items };
}

// ---------------------------------------------------------------- informe

export interface InformeCredito {
  id: number;
  fecha: string;
  creadoEn: string;
  cliente: { id: number; nombre: string };
  capital: number;
  intereses: number;
  tasa: number;
  cuotas: number;
  valorCuota: number;
  valorTotal: number;
  vence: string;
  periodo: string;
  estado: FilaCredito['estado'];
  saldo: number;
  totalAbonos: number;
  nPagos: number;
  cuotasPagadas: number;
  pagos: { id: number; item: number; valor: number; fecha: string; creadoEn: string; forma: 'EF' | 'TR'; saldo: number; modificado: boolean }[];
  historial: { id: number; estado: FilaCredito['estado']; fecha: string }[];
}

export function informeCredito(deps: Deps, sesion: Sesion, id: number): InformeCredito {
  exigir(sesion, 'creditos.ver');
  const k = cargarCredito(deps, sesion, id);
  const cliente = uno<{ id: number; nombres: string; apellidos: string }>(deps.db, 'SELECT id, nombres, apellidos FROM clientes WHERE id = ?', k.cliente_id);
  if (!cliente) throw noEncontrado('Cliente');
  const pagos = todos<{ id: number; valor: number; fecha: string; creado_en: string; forma: 'EF' | 'TR'; modificado: number }>(
    deps.db,
    'SELECT id, valor, fecha, creado_en, forma, modificado FROM pagos WHERE credito_id = ? AND anulado = 0 ORDER BY creado_en, id',
    id,
  );
  let saldo = k.total;
  const lista = pagos.map((p, i) => {
    saldo -= p.valor;
    return { id: p.id, item: i + 1, valor: p.valor, fecha: p.fecha, creadoEn: p.creado_en, forma: p.forma, saldo, modificado: p.modificado === 1 };
  });
  const abonos = pagos.reduce((s, p) => s + p.valor, 0);
  const historial = todos<{ id: number; estado: FilaCredito['estado']; fecha: string }>(
    deps.db,
    "SELECT id, estado, fecha FROM creditos WHERE cliente_id = ? AND estado <> 'ANULADO' ORDER BY id DESC",
    k.cliente_id,
  );
  return {
    id: k.id,
    fecha: k.fecha,
    creadoEn: k.creado_en,
    cliente: { id: cliente.id, nombre: `${cliente.nombres} ${cliente.apellidos}` },
    capital: k.capital,
    intereses: k.interes,
    tasa: k.tasa,
    cuotas: k.cuotas,
    valorCuota: k.valor_cuota,
    valorTotal: k.total,
    vence: k.vence,
    periodo: k.periodo,
    estado: k.estado,
    saldo: k.total - abonos,
    totalAbonos: abonos,
    nPagos: pagos.length,
    cuotasPagadas: cuotasPagadas(abonos, k.valor_cuota),
    pagos: lista,
    historial,
  };
}

// ---------------------------------------------------------------- edición (solo administrador)

function exigirModificable(deps: Deps, k: FilaCredito): void {
  exigirDiaAbierto(deps, k.cartera_id);
  if (k.fecha !== hoy(deps)) {
    throw conflicto('DIA_CERRADO', 'Solo se pueden modificar créditos vendidos el día de hoy');
  }
  if (uno(deps.db, 'SELECT id FROM pagos WHERE credito_id = ? AND anulado = 0 LIMIT 1', k.id)) {
    throw conflicto('CREDITO_CON_PAGOS', 'No es posible modificar el crédito: tiene pagos vigentes');
  }
}

export function editarCredito(deps: Deps, sesion: Sesion, id: number, d: DatosVenta): CreditoCreado {
  exigir(sesion, 'creditos.editar');
  return transaccion(deps.db, () => {
    const k = cargarCredito(deps, sesion, id);
    if (k.estado === 'ANULADO') throw conflicto('CREDITO_ANULADO', 'El crédito está anulado');
    exigirModificable(deps, k);
    validarVenta(d);
    const c = calcularCronograma(d.valorArticulo, d.utilidad, d.cuotas, d.periodo, k.fecha);
    ejecutar(
      deps.db,
      'UPDATE creditos SET capital = ?, tasa = ?, cuotas = ?, valor_cuota = ?, interes = ?, total = ?, periodo = ?, primera_cuota = ?, vence = ? WHERE id = ?',
      d.valorArticulo,
      d.utilidad,
      d.cuotas,
      c.valorCuota,
      c.interes,
      c.total,
      d.periodo,
      c.primeraCuota,
      c.vence,
      id,
    );
    auditar(deps, sesion, 'credito.editar', 'credito', id, { antes: { capital: k.capital, tasa: k.tasa, cuotas: k.cuotas, periodo: k.periodo }, despues: d });
    return { id, capital: d.valorArticulo, tasa: d.utilidad, interes: c.interes, total: c.total, cuotas: d.cuotas, valorCuota: c.valorCuota, periodo: d.periodo, fecha: k.fecha, primeraCuota: c.primeraCuota, vence: c.vence };
  });
}

export function anularCredito(deps: Deps, sesion: Sesion, id: number): void {
  exigir(sesion, 'creditos.editar');
  transaccion(deps.db, () => {
    const k = cargarCredito(deps, sesion, id);
    if (k.estado === 'ANULADO') throw conflicto('CREDITO_ANULADO', 'El crédito ya está anulado');
    exigirModificable(deps, k);
    ejecutar(deps.db, "UPDATE creditos SET estado = 'ANULADO' WHERE id = ?", id);
    auditar(deps, sesion, 'credito.anular', 'credito', id, { capital: k.capital });
  });
}
