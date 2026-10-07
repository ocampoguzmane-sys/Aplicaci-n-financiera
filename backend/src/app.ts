import cors from '@fastify/cors';
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

export async function construirApp(opciones: OpcionesApp): Promise<FastifyInstance> {
  const deps: Deps = { db: opciones.db, config: opciones.config, reloj: opciones.reloj ?? relojSistema };
  const limitador = opciones.limitador ?? new LimitadorLogin();
  const app = Fastify({ logger: opciones.logger ?? false, bodyLimit: 64 * 1024, trustProxy: opciones.config.produccion });

  if (opciones.config.corsOrigenes) {
    await app.register(cors, { origin: opciones.config.corsOrigenes, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Cartera-Id'] });
  }

  app.addHook('onSend', async (_req, respuesta) => {
    respuesta.header('Cache-Control', 'no-store');
    respuesta.header('X-Content-Type-Options', 'nosniff');
  });

  app.decorateRequest('sesion');
  app.addHook('onRequest', async (req) => {
    const ruta = (req.url.split('?')[0] ?? '').replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS' || RUTAS_PUBLICAS.has(`${req.method} ${ruta}`)) return;
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
  app.setNotFoundHandler((_req, respuesta) => respuesta.code(404).send({ error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: 'Ruta no encontrada' } }));

  registrarRutas(app, deps, limitador);
  return app;
}
