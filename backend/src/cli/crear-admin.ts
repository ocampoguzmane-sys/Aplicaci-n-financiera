// Crea la empresa, su primera cartera y el primer administrador.
//
//   npm run crear-admin -- --codigo 1001 --empresa "Mi Empresa" --cartera "Ruta 1" --usuario admin --nombre "Nombre Apellido"
//
// La contraseña se toma de la variable ADMIN_CLAVE. Si no existe, se genera una aleatoria y se muestra una sola vez.
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';
import { cargarConfig } from '../config.ts';
import { abrirDb } from '../db.ts';
import { crearEmpresaConAdministrador } from '../servicios/instalacion.ts';

function claveAleatoria(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numeros = '23456789';
  const todos = letras + numeros;
  let clave = letras[randomInt(letras.length)] as string;
  clave += numeros[randomInt(numeros.length)] as string;
  while (clave.length < 14) clave += todos[randomInt(todos.length)] as string;
  return clave;
}

const { values } = parseArgs({
  options: {
    codigo: { type: 'string' },
    empresa: { type: 'string' },
    cartera: { type: 'string', default: 'Principal' },
    usuario: { type: 'string' },
    nombre: { type: 'string' },
  },
});

if (!values.codigo || !values.empresa || !values.usuario || !values.nombre) {
  console.error('Uso: npm run crear-admin -- --codigo <código> --empresa <nombre> --usuario <usuario> --nombre <nombre completo> [--cartera <nombre>]');
  process.exit(1);
}

const generada = !process.env.ADMIN_CLAVE;
const clave = process.env.ADMIN_CLAVE ?? claveAleatoria();
const config = cargarConfig();
const db = abrirDb(config.dbRuta);
try {
  crearEmpresaConAdministrador(db, {
    codigo: values.codigo,
    empresa: values.empresa,
    carteraNombre: values.cartera,
    usuario: values.usuario,
    nombre: values.nombre,
    clave,
  });
  console.log(`Empresa "${values.empresa}" creada (código ${values.codigo}). Administrador: ${values.usuario}`);
  if (generada) console.log(`Contraseña generada (se muestra una sola vez, cámbiala al ingresar): ${clave}`);
} catch (error) {
  console.error('No se pudo crear:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.close();
}
