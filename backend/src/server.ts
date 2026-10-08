import { construirApp } from './app.ts';
import { cargarConfig } from './config.ts';
import { abrirDb } from './db.ts';
import { altaInicialDesdeEntorno } from './servicios/instalacion.ts';
import { cerrarDiasVencidos } from './servicios/dias.ts';
import { relojSistema } from './tiempo.ts';

const config = cargarConfig();
const db = abrirDb(config.dbRuta);

// Primer arranque sin consola: crea el administrador a partir de variables de entorno (ver docs/web.md).
let alta: ReturnType<typeof altaInicialDesdeEntorno>;
try {
  alta = altaInicialDesdeEntorno(db, process.env);
} catch (error) {
  console.error(`\n[inicio] No se pudo crear el administrador inicial: ${error instanceof Error ? error.message : error}`);
  console.error('[inicio] Corrige las variables ADMIN_* en el alojamiento y vuelve a desplegar.\n');
  process.exit(1);
}
if (alta === 'creada') console.log(`[inicio] Empresa y administrador "${process.env.ADMIN_USUARIO}" creados. Elimina la variable ADMIN_CLAVE del alojamiento.`);
else if (alta === 'ya-existe' && process.env.ADMIN_CLAVE) console.warn('[inicio] ADMIN_CLAVE sigue definida pero ya no se usa: elimínala del alojamiento.');
else if (alta === 'sin-variables') console.warn('[inicio] No hay ninguna empresa. Define ADMIN_CODIGO, ADMIN_EMPRESA, ADMIN_USUARIO, ADMIN_NOMBRE y ADMIN_CLAVE, o ejecuta "npm run crear-admin".');

const app = await construirApp({ db, config, logger: true });
const deps = { db, config, reloj: relojSistema };

// Cierre automático: a las 00:00 de Colombia se cierran los días que quedaron abiertos.
// Corre al arrancar (por si el servidor estuvo apagado a medianoche) y luego cada 30 segundos.
function cerrarVencidos(): void {
  try {
    const n = cerrarDiasVencidos(deps);
    if (n > 0) app.log.info({ cerrados: n }, 'días cerrados automáticamente');
  } catch (error) {
    app.log.error(error, 'falló el cierre automático de días');
  }
}
cerrarVencidos();
const planificador = setInterval(cerrarVencidos, 30_000);

async function apagar(): Promise<void> {
  clearInterval(planificador);
  await app.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);

await app.listen({ port: config.puerto, host: config.host });
