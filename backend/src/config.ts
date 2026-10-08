import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  puerto: number;
  host: string;
  dbRuta: string;
  jwtSecreto: string;
  jwtDuracionHoras: number;
  /** `true` permite cualquier origen (solo desarrollo); una lista restringe; `false` desactiva CORS. */
  corsOrigenes: string[] | boolean;
  produccion: boolean;
  /** Carpeta con la app web compilada (index.html). Si existe, el servidor la entrega en "/". */
  webDir: string | null;
}

/** WEB_DIR, o la carpeta ./web (imagen Docker), o la compilación local de la app. */
function ubicarWeb(env: NodeJS.ProcessEnv): string | null {
  const candidatos = [env.WEB_DIR, './web', '../app/build/web'].filter((c): c is string => Boolean(c));
  for (const c of candidatos) {
    const ruta = resolve(c);
    if (existsSync(resolve(ruta, 'index.html'))) return ruta;
  }
  if (env.WEB_DIR) console.warn(`[config] WEB_DIR=${env.WEB_DIR} no contiene index.html: no se entregará la web.`);
  return null;
}

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const produccion = env.NODE_ENV === 'production';
  let jwtSecreto = env.JWT_SECRET ?? '';
  if (jwtSecreto.length < 32) {
    if (produccion) throw new Error('JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres');
    jwtSecreto = randomBytes(32).toString('hex');
    console.warn('[config] JWT_SECRET no definido: se generó uno temporal (las sesiones se pierden al reiniciar).');
  }
  const origenes = env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  return {
    puerto: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    dbRuta: env.DB_PATH ?? './data/financiera.db',
    jwtSecreto,
    jwtDuracionHoras: Number(env.JWT_HORAS ?? 12),
    corsOrigenes: origenes && origenes.length > 0 ? origenes : !produccion,
    produccion,
    webDir: ubicarWeb(env),
  };
}
