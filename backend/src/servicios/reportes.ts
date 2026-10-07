import { ETIQUETA_FORMA, type FormaPago } from '../catalogos.ts';
import { calcularCronograma, esDiaDeCobro, type Cronograma } from '../credito.ts';
import { type Deps, exigir, hoy, type Sesion } from '../contexto.ts';
import { todos } from '../db.ts';
import { solicitudInvalida } from '../errores.ts';
import { esFechaValida } from '../tiempo.ts';
import { saldoBase } from './base.ts';
import { validarVenta } from './creditos.ts';
import { estadoDelDia, type EstadoDelDia } from './dias.ts';

function validarFecha(fecha: string): void {
  if (!esFechaValida(fecha)) throw solicitudInvalida('La fecha debe tener formato AAAA-MM-DD', 'FECHA_INVALIDA');
}

// ---------------------------------------------------------------- transacciones

export interface Transacciones {
  fecha: string;
  pagos: {
    total: number;
    efectivo: number;
    transferencia: number;
    items: { id: number; creditoId: number; cliente: string; valor: number; saldo: number; numeroPago: number; periodo: string; forma: FormaPago; formaEtiqueta: string; hora: string; modificado: boolean }[];
  };
  creditos: { total: number; items: { id: number; cliente: string; capital: number; total: number; cuotas: number; valorCuota: number; periodo: string }[] };
  gastos: { total: number; items: { id: number; tipo: string; valor: number; detalle: string; usuario: string }[] };
}

export function transacciones(deps: Deps, sesion: Sesion, carteraId: number, fecha: string): Transacciones {
  exigir(sesion, 'reportes.ver');
  validarFecha(fecha);
  const pagos = todos<{
    id: number;
    credito_id: number;
    nombres: string;
    apellidos: string;
    valor: number;
    total: number;
    acumulado: number;
    numero: number;
    periodo: string;
    forma: FormaPago;
    creado_en: string;
    modificado: number;
  }>(
    deps.db,
    `SELECT x.id, x.credito_id, c.nombres, c.apellidos, x.valor, k.total, x.acumulado, x.numero, k.periodo, x.forma, x.creado_en, x.modificado
     FROM (
       SELECT p.*, SUM(p.valor) OVER (PARTITION BY p.credito_id ORDER BY p.creado_en, p.id) AS acumulado,
              ROW_NUMBER() OVER (PARTITION BY p.credito_id ORDER BY p.creado_en, p.id) AS numero
       FROM pagos p WHERE p.cartera_id = ? AND p.anulado = 0
     ) x
     JOIN creditos k ON k.id = x.credito_id
     JOIN clientes c ON c.id = k.cliente_id
     WHERE x.fecha = ?
     ORDER BY c.nombres COLLATE NOCASE, c.apellidos COLLATE NOCASE, x.id`,
    carteraId,
    fecha,
  );
  const itemsPagos = pagos.map((p) => ({
    id: p.id,
    creditoId: p.credito_id,
    cliente: `${p.nombres} ${p.apellidos}`,
    valor: p.valor,
    saldo: p.total - p.acumulado,
    numeroPago: p.numero,
    periodo: p.periodo,
    forma: p.forma,
    formaEtiqueta: ETIQUETA_FORMA[p.forma],
    hora: p.creado_en,
    modificado: p.modificado === 1,
  }));
  const creditos = todos<{ id: number; nombres: string; apellidos: string; capital: number; total: number; cuotas: number; valor_cuota: number; periodo: string }>(
    deps.db,
    `SELECT k.id, c.nombres, c.apellidos, k.capital, k.total, k.cuotas, k.valor_cuota, k.periodo
     FROM creditos k JOIN clientes c ON c.id = k.cliente_id
     WHERE k.cartera_id = ? AND k.fecha = ? AND k.estado <> 'ANULADO' ORDER BY k.id`,
    carteraId,
    fecha,
  ).map((k) => ({ id: k.id, cliente: `${k.nombres} ${k.apellidos}`, capital: k.capital, total: k.total, cuotas: k.cuotas, valorCuota: k.valor_cuota, periodo: k.periodo }));
  const gastos = todos<{ id: number; tipo: string; valor: number; detalle: string; usuario: string }>(
    deps.db,
    `SELECT g.id, g.tipo, g.valor, g.detalle, u.nombre AS usuario FROM gastos g JOIN usuarios u ON u.id = g.usuario_id
     WHERE g.cartera_id = ? AND g.fecha = ? AND g.anulado = 0 ORDER BY g.id`,
    carteraId,
    fecha,
  );
  const efectivo = itemsPagos.filter((p) => p.forma === 'EF').reduce((s, p) => s + p.valor, 0);
  const transferencia = itemsPagos.filter((p) => p.forma === 'TR').reduce((s, p) => s + p.valor, 0);
  return {
    fecha,
    pagos: { total: efectivo + transferencia, efectivo, transferencia, items: itemsPagos },
    creditos: { total: creditos.reduce((s, k) => s + k.capital, 0), items: creditos },
    gastos: { total: gastos.reduce((s, g) => s + g.valor, 0), items: gastos },
  };
}

// ---------------------------------------------------------------- cierre

export interface Cierre {
  fecha: string;
  estado: EstadoDelDia;
  /** Base al iniciar el día. */
  base: number;
  adiciones: number;
  retiros: number;
  recaudos: { total: number; efectivo: number; transferencia: number };
  ventas: number;
  gastos: number;
  /** base + adiciones − retiros + recaudos − ventas − gastos */
  totalDia: number;
  valorARecaudar: number;
  /** Recaudos / valor a recaudar, en porcentaje con dos decimales; nulo si no había nada por recaudar. */
  efectividadRecaudo: number | null;
  /** Σ pago × tasa / (100 + tasa) */
  utilidadDiariaAprox: number;
}

export function cierre(deps: Deps, sesion: Sesion, carteraId: number, fecha: string): Cierre {
  exigir(sesion, 'reportes.ver');
  validarFecha(fecha);
  const suma = (sql: string, ...p: (string | number)[]): number => (todos<{ s: number }>(deps.db, sql, ...p)[0]?.s ?? 0);

  const base = saldoBase(deps, carteraId, fecha);
  const adiciones = suma("SELECT COALESCE(SUM(valor), 0) AS s FROM base_movimientos WHERE cartera_id = ? AND fecha = ? AND tipo = 'ADICION'", carteraId, fecha);
  const retiros = suma("SELECT COALESCE(SUM(valor), 0) AS s FROM base_movimientos WHERE cartera_id = ? AND fecha = ? AND tipo = 'RETIRO'", carteraId, fecha);
  const efectivo = suma("SELECT COALESCE(SUM(valor), 0) AS s FROM pagos WHERE cartera_id = ? AND fecha = ? AND anulado = 0 AND forma = 'EF'", carteraId, fecha);
  const transferencia = suma("SELECT COALESCE(SUM(valor), 0) AS s FROM pagos WHERE cartera_id = ? AND fecha = ? AND anulado = 0 AND forma = 'TR'", carteraId, fecha);
  const ventas = suma("SELECT COALESCE(SUM(capital), 0) AS s FROM creditos WHERE cartera_id = ? AND fecha = ? AND estado <> 'ANULADO'", carteraId, fecha);
  const gastos = suma('SELECT COALESCE(SUM(valor), 0) AS s FROM gastos WHERE cartera_id = ? AND fecha = ? AND anulado = 0', carteraId, fecha);
  const recaudos = efectivo + transferencia;

  // Valor a recaudar: cuota de cada crédito que tenía cobro ese día y saldo pendiente al iniciarlo.
  const pendientes = todos<{ periodo: string; primera_cuota: string; valor_cuota: number; total: number; abonado_antes: number }>(
    deps.db,
    `SELECT k.periodo, k.primera_cuota, k.valor_cuota, k.total,
            COALESCE((SELECT SUM(p.valor) FROM pagos p WHERE p.credito_id = k.id AND p.anulado = 0 AND p.fecha < ?), 0) AS abonado_antes
     FROM creditos k WHERE k.cartera_id = ? AND k.estado <> 'ANULADO' AND k.fecha < ?`,
    fecha,
    carteraId,
    fecha,
  );
  let valorARecaudar = 0;
  for (const k of pendientes) {
    const saldoInicial = k.total - k.abonado_antes;
    if (saldoInicial > 0 && esDiaDeCobro(k.periodo, k.primera_cuota, fecha)) valorARecaudar += Math.min(k.valor_cuota, saldoInicial);
  }

  const utilidad = todos<{ valor: number; tasa: number }>(
    deps.db,
    'SELECT p.valor, k.tasa FROM pagos p JOIN creditos k ON k.id = p.credito_id WHERE p.cartera_id = ? AND p.fecha = ? AND p.anulado = 0',
    carteraId,
    fecha,
  ).reduce((s, p) => s + Math.round((p.valor * p.tasa) / (100 + p.tasa)), 0);

  return {
    fecha,
    estado: estadoDelDia(deps, carteraId, fecha).estado,
    base,
    adiciones,
    retiros,
    recaudos: { total: recaudos, efectivo, transferencia },
    ventas,
    gastos,
    totalDia: base + adiciones - retiros + recaudos - ventas - gastos,
    valorARecaudar,
    efectividadRecaudo: valorARecaudar > 0 ? Math.round((recaudos / valorARecaudar) * 10000) / 100 : null,
    utilidadDiariaAprox: utilidad,
  };
}

// ---------------------------------------------------------------- notas

export interface Nota {
  id: number;
  creditoId: number;
  cliente: string;
  texto: string;
  fecha: string;
  creadoEn: string;
  usuario: string;
}

export function historialNotas(deps: Deps, sesion: Sesion, carteraId: number, desde?: string, hasta?: string): Nota[] {
  exigir(sesion, 'notas.ver');
  const fin = hasta ?? hoy(deps);
  const ini = desde ?? '0000-01-01';
  if (desde) validarFecha(desde);
  if (hasta) validarFecha(hasta);
  return todos<{ id: number; credito_id: number; nombres: string; apellidos: string; texto: string; fecha: string; creado_en: string; usuario: string }>(
    deps.db,
    `SELECT n.id, n.credito_id, c.nombres, c.apellidos, n.texto, n.fecha, n.creado_en, u.nombre AS usuario
     FROM notas n JOIN clientes c ON c.id = n.cliente_id JOIN usuarios u ON u.id = n.usuario_id
     WHERE n.cartera_id = ? AND n.fecha BETWEEN ? AND ? ORDER BY n.id DESC LIMIT 500`,
    carteraId,
    ini,
    fin,
  ).map((n) => ({ id: n.id, creditoId: n.credito_id, cliente: `${n.nombres} ${n.apellidos}`, texto: n.texto, fecha: n.fecha, creadoEn: n.creado_en, usuario: n.usuario }));
}

// ---------------------------------------------------------------- simulador

export function simular(
  deps: Deps,
  sesion: Sesion,
  datos: { valorArticulo: number; utilidad: number; cuotas: number; periodo: string },
): Cronograma {
  exigir(sesion, 'simulador.usar');
  validarVenta(datos);
  try {
    return calcularCronograma(datos.valorArticulo, datos.utilidad, datos.cuotas, datos.periodo, hoy(deps));
  } catch (e) {
    if (e instanceof RangeError) throw solicitudInvalida(e.message);
    throw e;
  }
}

