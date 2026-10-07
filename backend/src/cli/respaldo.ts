// Copia consistente de la base de datos (se puede ejecutar con el servidor en marcha).
//
//   npm run respaldo -- /ruta/de/copias/financiera-2026-10-06.db
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cargarConfig } from '../config.ts';
import { abrirDb } from '../db.ts';

const destino = process.argv[2];
if (!destino) {
  console.error('Uso: npm run respaldo -- <archivo de destino>');
  process.exit(1);
}
const ruta = resolve(destino);
if (existsSync(ruta)) {
  console.error(`Ya existe ${ruta}; elige otro nombre para no sobrescribir un respaldo.`);
  process.exit(1);
}
const db = abrirDb(cargarConfig().dbRuta);
try {
  db.prepare('VACUUM INTO ?').run(ruta);
  console.log(`Respaldo creado en ${ruta}`);
} finally {
  db.close();
}
