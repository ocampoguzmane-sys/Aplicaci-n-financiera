import type { Config } from './config.ts';
import { type Db, ejecutar, uno } from './db.ts';
import { conflicto, noEncontrado, prohibido, solicitudInvalida } from './errores.ts';
import { puede, type Permiso, type Rol } from './permissions.ts';
import { fechaColombia, instanteISO, type Reloj } from './tiempo.ts';

export interface Deps {
  db: Db;
  reloj: Reloj;
  config: Config;
}

export interface Sesion {
  usuarioId: number;
  empresaId: number;
  rol: Rol;
  /** Cartera asignada: obligatoria para el empleado, opcional (por defecto) para los demás roles. */
  carteraId: number | null;
  nombre: string;
  usuario: string;
}

export function exigir(sesion: Sesion, permiso: Permiso): void {
  if (!puede(sesion.rol, permiso)) throw prohibido();
}

export const hoy = (deps: Deps): string => fechaColombia(deps.reloj.ahora());
export const ahoraISO = (deps: Deps): string => instanteISO(deps.reloj.ahora());

/** ¿Puede esta sesión operar sobre la cartera? Todas las carteras de la empresa, o solo la propia. */
export function puedeAccederCartera(sesion: Sesion, carteraId: number): boolean {
  return puede(sesion.rol, 'carteras.ver_todas') || sesion.carteraId === carteraId;
}

/**
 * Para recursos con identificador (cliente, crédito, pago…): si la cartera del recurso no es accesible
 * para la sesión se responde "no encontrado", para no revelar que existe en otra cartera.
 */
export function exigirAccesoCartera(sesion: Sesion, carteraId: number, que: string): void {
  if (!puedeAccederCartera(sesion, carteraId)) throw noEncontrado(que);
}

/** Patrón para LIKE con escape de comodines, usado en los buscadores. */
export function patronBusqueda(texto: string): string {
  return `%${texto.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

interface FilaCartera {
  id: number;
  activa: number;
}

/**
 * Cartera sobre la que opera una petición de colección (listados, día, base, reportes).
 * El empleado siempre usa la suya; administrador y supervisor eligen con X-Cartera-Id
 * o usan la asignada por defecto.
 */
export function resolverCartera(deps: Deps, sesion: Sesion, solicitada: number | null): number {
  const id = puede(sesion.rol, 'carteras.ver_todas') ? (solicitada ?? sesion.carteraId) : sesion.carteraId;
  if (id == null) {
    throw solicitudInvalida('Indica la cartera con la cabecera X-Cartera-Id', 'CARTERA_REQUERIDA');
  }
  const fila = uno<FilaCartera>(deps.db, 'SELECT id, activa FROM carteras WHERE id = ? AND empresa_id = ?', id, sesion.empresaId);
  if (!fila) throw noEncontrado('Cartera');
  if (!fila.activa) throw conflicto('CARTERA_INACTIVA', 'La cartera está inactiva');
  return id;
}

export function auditar(
  deps: Deps,
  sesion: Pick<Sesion, 'empresaId' | 'usuarioId'>,
  accion: string,
  entidad: string,
  entidadId: number | null,
  detalle: Record<string, unknown> = {},
): void {
  ejecutar(
    deps.db,
    'INSERT INTO auditoria (empresa_id, usuario_id, accion, entidad, entidad_id, detalle, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)',
    sesion.empresaId,
    sesion.usuarioId,
    accion,
    entidad,
    entidadId,
    JSON.stringify(detalle),
    ahoraISO(deps),
  );
}
