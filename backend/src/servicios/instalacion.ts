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
