import { auditar, type Deps, exigir, type Sesion } from '../contexto.ts';
import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { conflicto, noEncontrado, solicitudInvalida } from '../errores.ts';
import { puede } from '../permissions.ts';

export interface Cartera {
  id: number;
  nombre: string;
  ordenModo: 'ALFABETICO' | 'PERSONALIZADO';
  activa: boolean;
}

interface FilaCartera {
  id: number;
  nombre: string;
  orden_modo: 'ALFABETICO' | 'PERSONALIZADO';
  activa: number;
}

const aCartera = (f: FilaCartera): Cartera => ({ id: f.id, nombre: f.nombre, ordenModo: f.orden_modo, activa: f.activa === 1 });

export function listarCarteras(deps: Deps, sesion: Sesion): Cartera[] {
  const todas = puede(sesion.rol, 'carteras.ver_todas');
  const filas = todas
    ? todos<FilaCartera>(deps.db, 'SELECT * FROM carteras WHERE empresa_id = ? ORDER BY nombre COLLATE NOCASE', sesion.empresaId)
    : todos<FilaCartera>(deps.db, 'SELECT * FROM carteras WHERE empresa_id = ? AND id = ?', sesion.empresaId, sesion.carteraId ?? -1);
  return filas.map(aCartera);
}

export function crearCartera(deps: Deps, sesion: Sesion, datos: { nombre: string }): Cartera {
  exigir(sesion, 'carteras.gestionar');
  const nombre = datos.nombre.trim();
  if (!nombre) throw solicitudInvalida('El nombre es obligatorio');
  return transaccion(deps.db, () => {
    if (uno(deps.db, 'SELECT id FROM carteras WHERE empresa_id = ? AND nombre = ?', sesion.empresaId, nombre)) {
      throw conflicto('CARTERA_DUPLICADA', 'Ya existe una cartera con ese nombre');
    }
    const { id } = ejecutar(deps.db, 'INSERT INTO carteras (empresa_id, nombre) VALUES (?, ?)', sesion.empresaId, nombre);
    auditar(deps, sesion, 'cartera.crear', 'cartera', id, { nombre });
    return aCartera(uno<FilaCartera>(deps.db, 'SELECT * FROM carteras WHERE id = ?', id) as FilaCartera);
  });
}

export function actualizarCartera(deps: Deps, sesion: Sesion, id: number, cambios: { nombre?: string; activa?: boolean }): Cartera {
  exigir(sesion, 'carteras.gestionar');
  return transaccion(deps.db, () => {
    const actual = uno<FilaCartera>(deps.db, 'SELECT * FROM carteras WHERE id = ? AND empresa_id = ?', id, sesion.empresaId);
    if (!actual) throw noEncontrado('Cartera');
    const nombre = cambios.nombre?.trim() || actual.nombre;
    if (nombre !== actual.nombre && uno(deps.db, 'SELECT id FROM carteras WHERE empresa_id = ? AND nombre = ?', sesion.empresaId, nombre)) {
      throw conflicto('CARTERA_DUPLICADA', 'Ya existe una cartera con ese nombre');
    }
    ejecutar(deps.db, 'UPDATE carteras SET nombre = ?, activa = ? WHERE id = ?', nombre, (cambios.activa ?? actual.activa === 1) ? 1 : 0, id);
    auditar(deps, sesion, 'cartera.actualizar', 'cartera', id, { nombre, activa: cambios.activa });
    return aCartera(uno<FilaCartera>(deps.db, 'SELECT * FROM carteras WHERE id = ?', id) as FilaCartera);
  });
}
