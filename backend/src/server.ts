import { construirApp } from './app.ts';
import { cargarConfig } from './config.ts';
import { abrirDb } from './db.ts';
import { cerrarDiasVencidos } from './servicios/dias.ts';
import { relojSistema } from './tiempo.ts';

const config = cargarConfig();
const db = abrirDb(config.dbRuta);
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
