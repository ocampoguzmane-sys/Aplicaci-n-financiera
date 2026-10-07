// La base es el dinero disponible de la cartera:
//   adiciones − retiros + recaudos − capital entregado en ventas − gastos
import { LARGO_MAXIMO_DETALLE } from '../catalogos.ts';
import { ahoraISO, auditar, type Deps, exigir, type Sesion } from '../contexto.ts';
import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { conflicto, solicitudInvalida } from '../errores.ts';
import { exigirDiaAbierto } from './dias.ts';

/** Saldo de la base. Con `antesDe` solo cuenta lo ocurrido en fechas anteriores (base inicial de ese día). */
export function saldoBase(deps: Deps, carteraId: number, antesDe?: string): number {
  const filtro = (columna: string) => (antesDe ? `AND ${columna} < ?` : '');
  const param = antesDe ? [antesDe] : [];
  const suma = (sql: string): number => uno<{ s: number }>(deps.db, sql, carteraId, ...param)?.s ?? 0;
  const adiciones = suma(`SELECT COALESCE(SUM(valor), 0) AS s FROM base_movimientos WHERE cartera_id = ? AND tipo = 'ADICION' ${filtro('fecha')}`);
  const retiros = suma(`SELECT COALESCE(SUM(valor), 0) AS s FROM base_movimientos WHERE cartera_id = ? AND tipo = 'RETIRO' ${filtro('fecha')}`);
  const recaudos = suma(`SELECT COALESCE(SUM(valor), 0) AS s FROM pagos WHERE cartera_id = ? AND anulado = 0 ${filtro('fecha')}`);
  const ventas = suma(`SELECT COALESCE(SUM(capital), 0) AS s FROM creditos WHERE cartera_id = ? AND estado <> 'ANULADO' ${filtro('fecha')}`);
  const gastos = suma(`SELECT COALESCE(SUM(valor), 0) AS s FROM gastos WHERE cartera_id = ? AND anulado = 0 ${filtro('fecha')}`);
  return adiciones - retiros + recaudos - ventas - gastos;
}

export interface MovimientoBase {
  id: number;
  tipo: 'ADICION' | 'RETIRO';
  valor: number;
  detalle: string;
  fecha: string;
  creadoEn: string;
  usuario: string;
}

export function consultarBase(deps: Deps, sesion: Sesion, carteraId: number): { saldo: number; movimientos: MovimientoBase[] } {
  exigir(sesion, 'base.ver');
  const movimientos = todos<{ id: number; tipo: 'ADICION' | 'RETIRO'; valor: number; detalle: string; fecha: string; creado_en: string; usuario: string }>(
    deps.db,
    `SELECT m.id, m.tipo, m.valor, m.detalle, m.fecha, m.creado_en, u.nombre AS usuario
     FROM base_movimientos m JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.cartera_id = ? ORDER BY m.id DESC LIMIT 100`,
    carteraId,
  ).map((m) => ({ id: m.id, tipo: m.tipo, valor: m.valor, detalle: m.detalle, fecha: m.fecha, creadoEn: m.creado_en, usuario: m.usuario }));
  return { saldo: saldoBase(deps, carteraId), movimientos };
}

export function ajustarBase(
  deps: Deps,
  sesion: Sesion,
  carteraId: number,
  datos: { tipo: 'ADICION' | 'RETIRO'; valor: number; detalle?: string },
): { id: number; saldo: number } {
  exigir(sesion, 'base.ajustar');
  if (datos.tipo !== 'ADICION' && datos.tipo !== 'RETIRO') throw solicitudInvalida('El tipo debe ser ADICION o RETIRO', 'TIPO_INVALIDO');
  if (!Number.isInteger(datos.valor) || datos.valor < 1) throw solicitudInvalida('El valor debe ser un entero positivo', 'VALOR_INVALIDO');
  const detalle = (datos.detalle ?? '').trim();
  if (detalle.length > LARGO_MAXIMO_DETALLE) throw solicitudInvalida(`El detalle admite hasta ${LARGO_MAXIMO_DETALLE} caracteres`, 'DETALLE_LARGO');
  return transaccion(deps.db, () => {
    const fecha = exigirDiaAbierto(deps, carteraId);
    const actual = saldoBase(deps, carteraId);
    if (datos.tipo === 'RETIRO' && datos.valor > actual) {
      throw conflicto('BASE_INSUFICIENTE', `El retiro supera la base disponible (${actual})`);
    }
    const { id } = ejecutar(
      deps.db,
      'INSERT INTO base_movimientos (empresa_id, cartera_id, tipo, valor, detalle, fecha, creado_en, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      sesion.empresaId,
      carteraId,
      datos.tipo,
      datos.valor,
      detalle,
      fecha,
      ahoraISO(deps),
      sesion.usuarioId,
    );
    auditar(deps, sesion, datos.tipo === 'ADICION' ? 'base.adicionar' : 'base.retirar', 'base', id, { carteraId, valor: datos.valor });
    return { id, saldo: saldoBase(deps, carteraId) };
  });
}
