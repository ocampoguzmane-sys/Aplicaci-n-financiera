// Alta inicial de una empresa con su primera cartera y su administrador. Lo usan el CLI y las pruebas.
import { hashClave, validarPoliticaClave } from '../auth.ts';
import { type Db, ejecutar, transaccion, uno } from '../db.ts';
import { conflicto } from '../errores.ts';

export function crearEmpresaConAdministrador(
  db: Db,
  datos: { codigo: string; empresa: string; carteraNombre: string; usuario: string; nombre: string; clave: string },
  ahora: string = new Date().toISOString(),
): { empresaId: number; carteraId: number; usuarioId: number } {
  validarPoliticaClave(datos.clave, datos.usuario);
  return transaccion(db, () => {
    if (uno(db, 'SELECT id FROM empresas WHERE codigo = ?', datos.codigo)) {
      throw conflicto('EMPRESA_DUPLICADA', `Ya existe una empresa con el código ${datos.codigo}`);
    }
    const { id: empresaId } = ejecutar(db, 'INSERT INTO empresas (codigo, nombre, creada_en) VALUES (?, ?, ?)', datos.codigo, datos.empresa, ahora);
    const { id: carteraId } = ejecutar(db, 'INSERT INTO carteras (empresa_id, nombre) VALUES (?, ?)', empresaId, datos.carteraNombre);
    const { id: usuarioId } = ejecutar(
      db,
      "INSERT INTO usuarios (empresa_id, usuario, nombre, rol, cartera_id, clave_hash, creado_en) VALUES (?, ?, ?, 'administrador', ?, ?, ?)",
      empresaId,
      datos.usuario,
      datos.nombre,
      carteraId,
      hashClave(datos.clave),
      ahora,
    );
    return { empresaId, carteraId, usuarioId };
  });
}

export type ResultadoAltaInicial = 'creada' | 'ya-existe' | 'sin-variables';

/**
 * Primer arranque en un alojamiento sin consola: si la base está vacía y existen las variables
 * ADMIN_CODIGO, ADMIN_EMPRESA, ADMIN_USUARIO, ADMIN_NOMBRE y ADMIN_CLAVE, crea la empresa y su administrador.
 * Si la base ya tiene una empresa, no hace nada (las variables se pueden y se deben quitar después).
 */
export function altaInicialDesdeEntorno(db: Db, env: NodeJS.ProcessEnv): ResultadoAltaInicial {
  if (uno(db, 'SELECT id FROM empresas LIMIT 1')) return 'ya-existe';
  const { ADMIN_CODIGO: codigo, ADMIN_EMPRESA: empresa, ADMIN_USUARIO: usuario, ADMIN_NOMBRE: nombre, ADMIN_CLAVE: clave } = env;
  if (!codigo || !empresa || !usuario || !nombre || !clave) return 'sin-variables';
  crearEmpresaConAdministrador(db, { codigo, empresa, carteraNombre: env.ADMIN_CARTERA || 'Principal', usuario, nombre, clave });
  return 'creada';
}
