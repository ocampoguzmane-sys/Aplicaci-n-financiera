import compress from '@fastify/compress';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { LimitadorLogin, verificarToken } from './auth.ts';
import type { Config } from './config.ts';
import type { Deps } from './contexto.ts';
import type { Db } from './db.ts';
import { ErrorApp } from './errores.ts';
import { registrarRutas } from './rutas.ts';
import { cargarSesion } from './servicios/usuarios.ts';
import { relojSistema, type Reloj } from './tiempo.ts';

export interface OpcionesApp {
  db: Db;
  config: Config;
  reloj?: Reloj;
  limitador?: LimitadorLogin;
  logger?: boolean;
}

const RUTAS_PUBLICAS = new Set(['GET /salud', 'POST /api/v1/auth/login']);

/**
 * Política de contenido de la web (Flutter con CanvasKit): todo del mismo origen, sin scripts de terceros.
 * 'wasm-unsafe-eval' es necesario para ejecutar WebAssembly; los estilos en línea los usa Flutter.
 */
const CSP_WEB = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const esApi = (url: string): boolean => url.startsWith('/api/') || url === '/salud';

export async function construirApp(opciones: OpcionesApp): Promise<FastifyInstance> {
  const deps: Deps = { db: opciones.db, config: opciones.config, reloj: opciones.reloj ?? relojSistema };
  const limitador = opciones.limitador ?? new LimitadorLogin();
  const app = Fastify({ logger: opciones.logger ?? false, bodyLimit: 64 * 1024, trustProxy: opciones.config.produccion });

  if (opciones.config.corsOrigenes) {
    await app.register(cors, { origin: opciones.config.corsOrigenes, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Cartera-Id'] });
  }

  // Los clientes suelen enviar `content-type: application/json` también en POST sin cuerpo (p. ej. abrir el día).
  // Se acepta el cuerpo vacío y se conserva la protección contra claves peligrosas como `__proto__`.
  const parsearJson = app.getDefaultJsonParser('error', 'error');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, cuerpo, hecho) => {
    if (typeof cuerpo === 'string' && cuerpo.trim() === '') return hecho(null, undefined);
    parsearJson(req, cuerpo as string, hecho);
  });

  await app.register(compress, { threshold: 1024 });

  app.addHook('onSend', async (req, respuesta) => {
    respuesta.header('X-Content-Type-Options', 'nosniff');
    respuesta.header('X-Frame-Options', 'DENY');
    respuesta.header('Referrer-Policy', 'no-referrer');
    respuesta.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    // HTTPS obligatorio una vez que se entró por HTTPS (detrás de un proxy, según X-Forwarded-Proto).
    if (opciones.config.produccion && req.protocol === 'https') respuesta.header('Strict-Transport-Security', 'max-age=15552000');
    if (esApi(req.url)) {
      respuesta.header('Cache-Control', 'no-store'); // las respuestas de la API nunca se guardan en caché
    } else {
      respuesta.header('Content-Security-Policy', CSP_WEB);
    }
  });

  app.decorateRequest('sesion');
  app.addHook('onRequest', async (req) => {
    const ruta = (req.url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
    // Solo la API exige sesión; la web (archivos estáticos) es pública y la pantalla de acceso se muestra sin ella.
    if (!ruta.startsWith('/api/') || req.method === 'OPTIONS' || RUTAS_PUBLICAS.has(`${req.method} ${ruta}`)) return;
    const cabecera = req.headers.authorization;
    if (!cabecera?.startsWith('Bearer ')) throw new ErrorApp(401, 'NO_AUTENTICADO', 'Falta la sesión. Inicia sesión.');
    const payload = await verificarToken(cabecera.slice(7), deps.config.jwtSecreto);
    req.sesion = cargarSesion(deps, payload.usuarioId, payload.empresaId);
  });

  app.setErrorHandler((error, req, respuesta) => {
    if (error instanceof ErrorApp) {
      return respuesta.code(error.estado).send({ error: { codigo: error.codigo, mensaje: error.message } });
    }
    const estado = (error as { statusCode?: number }).statusCode;
    if (estado && estado >= 400 && estado < 500) {
      return respuesta.code(estado).send({ error: { codigo: 'SOLICITUD_INVALIDA', mensaje: (error as Error).message } });
    }
    req.log.error(error);
    return respuesta.code(500).send({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } });
  });
  if (opciones.config.webDir) {
    await app.register(fastifyStatic, {
      root: opciones.config.webDir,
      index: ['index.html'],
      dotfiles: 'ignore',
      cacheControl: false,
      // Siempre se revalida (ETag): una actualización de la app se ve de inmediato y un archivo sin cambios responde 304.
      setHeaders: (respuesta) => {
        respuesta.header('Cache-Control', 'no-cache');
      },
    });
  }
  app.setNotFoundHandler((req, respuesta) => {
    // Rutas internas de la app (por ejemplo, al recargar la página): se entrega la pantalla principal.
    const ruta = req.url.split('?')[0] ?? '';
    const esNavegacion = (req.method === 'GET' || req.method === 'HEAD') && !esApi(req.url) && !/\.[A-Za-z0-9]+$/.test(ruta);
    if (opciones.config.webDir && esNavegacion) return respuesta.header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').sendFile('index.html');
    return respuesta.code(404).send({ error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'Ruta no encontrada' } });
  });

  registrarRutas(app, deps, limitador);
  return app;
}
