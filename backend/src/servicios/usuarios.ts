import { HASH_RELLENO, hashClave, type LimitadorLogin, validarPoliticaClave, verificarClave } from '../auth.ts';
import { ahoraISO, auditar, type Deps, exigir, type Sesion } from '../contexto.ts';
import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { conflicto, ErrorApp, noEncontrado, solicitudInvalida } from '../errores.ts';
import { ROLES, type Rol } from '../permissions.ts';

interface FilaUsuario {
  id: number;
  empresa_id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  cartera_id: number | null;
  clave_hash: string;
  activo: number;
  creado_en: string;
  cartera_nombre: string | null;
}

export interface UsuarioPublico {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  carteraId: number | null;
  carteraNombre: string | null;
  activo: boolean;
  creadoEn: string;
}

const SELECT_USUARIO = `
  SELECT u.*, c.nombre AS cartera_nombre
  FROM usuarios u LEFT JOIN carteras c ON c.id = u.cartera_id`;

function publico(f: FilaUsuario): UsuarioPublico {
  return {
    id: f.id,
    usuario: f.usuario,
    nombre: f.nombre,
    rol: f.rol,
    carteraId: f.cartera_id,
    carteraNombre: f.cartera_nombre,
    activo: f.activo === 1,
    creadoEn: f.creado_en,
  };
}

const REGEX_USUARIO = /^[A-Za-z0-9._-]{3,30}$/;

// ---------------------------------------------------------------- inicio de sesión

export interface ResultadoLogin {
  usuario: UsuarioPublico;
  empresa: { codigo: string; nombre: string };
  sesion: Sesion;
}

export function iniciarSesion(
  deps: Deps,
  limitador: LimitadorLogin,
  datos: { codigo: string; usuario: string; clave: string },
): ResultadoLogin {
  const ahora = deps.reloj.ahora().getTime();
  const llave = `${datos.codigo}|${datos.usuario.toLowerCase()}`;
  limitador.comprobar(llave, ahora);

  const empresa = uno<{ id: number; codigo: string; nombre: string }>(
    deps.db,
    'SELECT id, codigo, nombre FROM empresas WHERE codigo = ?',
    datos.codigo,
  );
  const fila = empresa
    ? uno<FilaUsuario>(deps.db, `${SELECT_USUARIO} WHERE u.empresa_id = ? AND u.usuario = ?`, empresa.id, datos.usuario)
    : undefined;
  // Siempre se verifica una contraseña, exista o no el usuario, para no filtrar su existencia por tiempo.
  const claveCorrecta = verificarClave(datos.clave, fila?.clave_hash ?? HASH_RELLENO);
  if (!empresa || !fila || !claveCorrecta || fila.activo !== 1) {
    limitador.fallo(llave, ahora);
    throw new ErrorApp(401, 'CREDENCIALES_INVALIDAS', 'Código, usuario o contraseña incorrectos');
  }
  limitador.exito(llave);
  auditar(deps, { empresaId: empresa.id, usuarioId: fila.id }, 'sesion.iniciar', 'usuario', fila.id);
  return {
    usuario: publico(fila),
    empresa: { codigo: empresa.codigo, nombre: empresa.nombre },
    sesion: sesionDe(fila),
  };
}

export function sesionDe(f: FilaUsuario): Sesion {
  return { usuarioId: f.id, empresaId: f.empresa_id, rol: f.rol, carteraId: f.cartera_id, nombre: f.nombre, usuario: f.usuario };
}

/** Carga la sesión vigente desde la base: un usuario desactivado o con otro rol lo refleja de inmediato. */
export function cargarSesion(deps: Deps, usuarioId: number, empresaId: number): Sesion {
  const fila = uno<FilaUsuario>(deps.db, `${SELECT_USUARIO} WHERE u.id = ? AND u.empresa_id = ?`, usuarioId, empresaId);
  if (!fila || fila.activo !== 1) throw new ErrorApp(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida');
  return sesionDe(fila);
}

export function obtenerPerfil(deps: Deps, sesion: Sesion): { usuario: UsuarioPublico; empresa: { codigo: string; nombre: string } } {
  const fila = uno<FilaUsuario>(deps.db, `${SELECT_USUARIO} WHERE u.id = ?`, sesion.usuarioId);
  const empresa = uno<{ codigo: string; nombre: string }>(deps.db, 'SELECT codigo, nombre FROM empresas WHERE id = ?', sesion.empresaId);
  if (!fila || !empresa) throw noEncontrado('Usuario');
  return { usuario: publico(fila), empresa };
}

export function cambiarClave(deps: Deps, sesion: Sesion, datos: { actual: string; nueva: string }): void {
  const fila = uno<FilaUsuario>(deps.db, `${SELECT_USUARIO} WHERE u.id = ?`, sesion.usuarioId);
  if (!fila || !verificarClave(datos.actual, fila.clave_hash)) {
    throw new ErrorApp(400, 'CLAVE_ACTUAL_INCORRECTA', 'La contraseña actual no es correcta');
  }
  validarPoliticaClave(datos.nueva, fila.usuario);
  ejecutar(deps.db, 'UPDATE usuarios SET clave_hash = ? WHERE id = ?', hashClave(datos.nueva), sesion.usuarioId);
  auditar(deps, sesion, 'usuario.cambiar_clave', 'usuario', sesion.usuarioId);
}

// ---------------------------------------------------------------- administración de usuarios

export function listarUsuarios(deps: Deps, sesion: Sesion): UsuarioPublico[] {
  exigir(sesion, 'usuarios.gestionar');
  return todos<FilaUsuario>(deps.db, `${SELECT_USUARIO} WHERE u.empresa_id = ? ORDER BY u.nombre COLLATE NOCASE`, sesion.empresaId).map(publico);
}

function validarCartera(deps: Deps, empresaId: number, carteraId: number): void {
  const c = uno(deps.db, 'SELECT id FROM carteras WHERE id = ? AND empresa_id = ?', carteraId, empresaId);
  if (!c) throw solicitudInvalida('La cartera indicada no existe', 'CARTERA_INVALIDA');
}

export function crearUsuario(
  deps: Deps,
  sesion: Sesion,
  datos: { usuario: string; nombre: string; rol: Rol; carteraId?: number | null; clave: string },
): UsuarioPublico {
  exigir(sesion, 'usuarios.gestionar');
  if (!REGEX_USUARIO.test(datos.usuario)) {
    throw solicitudInvalida('El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo', 'USUARIO_INVALIDO');
  }
  if (!ROLES.includes(datos.rol)) throw solicitudInvalida('Rol inválido', 'ROL_INVALIDO');
  const carteraId = datos.carteraId ?? null;
  if (datos.rol === 'empleado' && carteraId == null) {
    throw solicitudInvalida('El empleado debe tener una cartera asignada', 'CARTERA_REQUERIDA');
  }
  if (carteraId != null) validarCartera(deps, sesion.empresaId, carteraId);
  validarPoliticaClave(datos.clave, datos.usuario);

  return transaccion(deps.db, () => {
    if (uno(deps.db, 'SELECT id FROM usuarios WHERE empresa_id = ? AND usuario = ?', sesion.empresaId, datos.usuario)) {
      throw conflicto('USUARIO_DUPLICADO', 'Ya existe un usuario con ese nombre');
    }
    const { id } = ejecutar(
      deps.db,
      'INSERT INTO usuarios (empresa_id, usuario, nombre, rol, cartera_id, clave_hash, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)',
      sesion.empresaId,
      datos.usuario,
      datos.nombre,
      datos.rol,
      carteraId,
      hashClave(datos.clave),
      ahoraISO(deps),
    );
    auditar(deps, sesion, 'usuario.crear', 'usuario', id, { usuario: datos.usuario, rol: datos.rol, carteraId });
    return publico(uno<FilaUsuario>(deps.db, `${SELECT_USUARIO} WHERE u.id = ?`, id) as FilaUsuario);
  });
}

export function actualizarUsuario(
  deps: Deps,
  sesion: Sesion,
  id: number,
  cambios: { nombre?: string; rol?: Rol; carteraId?: number | null; activo?: boolean; clave?: string },
): UsuarioPublico {
  exigir(sesion, 'usuarios.gestionar');
  return transaccion(deps.db, () => {
    const actual = uno<FilaUsuario>(deps.db, `${SELECT_USUARIO} WHERE u.id = ? AND u.empresa_id = ?`, id, sesion.empresaId);
    if (!actual) throw noEncontrado('Usuario');

    const rol = cambios.rol ?? actual.rol;
    const activo = cambios.activo ?? actual.activo === 1;
    const carteraId = cambios.carteraId === undefined ? actual.cartera_id : cambios.carteraId;
    if (rol === 'empleado' && carteraId == null) {
      throw solicitudInvalida('El empleado debe tener una cartera asignada', 'CARTERA_REQUERIDA');
    }
    if (carteraId != null) validarCartera(deps, sesion.empresaId, carteraId);

    // Evita que el administrador se bloquee a sí mismo o deje la empresa sin administradores.
    const deshaceAdmin = actual.rol === 'administrador' && actual.activo === 1 && (rol !== 'administrador' || !activo);
    if (deshaceAdmin) {
      if (id === sesion.usuarioId) {
        throw conflicto('AUTOBLOQUEO', 'No puedes quitarte tu propio rol de administrador ni desactivarte');
      }
      const restantes = uno<{ n: number }>(
        deps.db,
        "SELECT COUNT(*) AS n FROM usuarios WHERE empresa_id = ? AND rol = 'administrador' AND activo = 1 AND id <> ?",
        sesion.empresaId,
        id,
      );
      if (!restantes || restantes.n < 1) throw conflicto('ULTIMO_ADMINISTRADOR', 'Debe quedar al menos un administrador activo');
    }

    let claveHash = actual.clave_hash;
    if (cambios.clave !== undefined) {
      validarPoliticaClave(cambios.clave, actual.usuario);
      claveHash = hashClave(cambios.clave);
    }
    ejecutar(
      deps.db,
      'UPDATE usuarios SET nombre = ?, rol = ?, cartera_id = ?, activo = ?, clave_hash = ? WHERE id = ?',
      cambios.nombre ?? actual.nombre,
      rol,
      carteraId,
      activo ? 1 : 0,
      claveHash,
      id,
    );
    auditar(deps, sesion, 'usuario.actualizar', 'usuario', id, {
      rol,
      activo,
      carteraId,
      nombre: cambios.nombre !== undefined,
      clave: cambios.clave !== undefined,
    });
    return publico(uno<FilaUsuario>(deps.db, `${SELECT_USUARIO} WHERE u.id = ?`, id) as FilaUsuario);
  });
}
