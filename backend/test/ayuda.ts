import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.ts';
import { firmarToken, hashClave } from '../src/auth.ts';
import { cargarConfig, type Config } from '../src/config.ts';
import type { Deps } from '../src/contexto.ts';
import { abrirDb, type Db, ejecutar } from '../src/db.ts';
import { relojFijo } from '../src/tiempo.ts';

export const CLAVE = 'Clave1234';
const HASH = hashClave(CLAVE); // se calcula una sola vez: scrypt es lento a propósito
export const INICIO = '2026-10-06T15:00:00.000Z'; // martes 6-oct-2026, 10:00 en Colombia

export interface Respuesta {
  estado: number;
  cuerpo: any;
}

export interface Entorno {
  app: FastifyInstance;
  db: Db;
  deps: Deps;
  reloj: ReturnType<typeof relojFijo>;
  ids: { empresa: number; norte: number; sur: number; admin: number; supervisor: number; empleado: number; empleadoSur: number };
  token: Record<'admin' | 'supervisor' | 'empleado' | 'empleadoSur', string>;
  api(token: string | null, metodo: string, url: string, cuerpo?: unknown, cabeceras?: Record<string, string>): Promise<Respuesta>;
  cerrar(): Promise<void>;
}

/** Empresa de prueba con dos carteras y un usuario de cada rol, sobre una base en memoria y un reloj controlable. */
export async function nuevoEntorno(): Promise<Entorno> {
  const db = abrirDb(':memory:');
  const reloj = relojFijo(INICIO);
  const config: Config = { ...cargarConfig({ NODE_ENV: 'test', JWT_SECRET: 'j'.repeat(40) } as NodeJS.ProcessEnv), corsOrigenes: false };
  const app = await construirApp({ db, config, reloj });
  const deps: Deps = { db, config, reloj };

  const ahora = INICIO;
  const empresa = ejecutar(db, "INSERT INTO empresas (codigo, nombre, creada_en) VALUES ('T1', 'Empresa de prueba', ?)", ahora).id;
  const norte = ejecutar(db, "INSERT INTO carteras (empresa_id, nombre) VALUES (?, 'Norte')", empresa).id;
  const sur = ejecutar(db, "INSERT INTO carteras (empresa_id, nombre) VALUES (?, 'Sur')", empresa).id;
  const usuario = (nombre: string, rol: string, cartera: number | null) =>
    ejecutar(db, 'INSERT INTO usuarios (empresa_id, usuario, nombre, rol, cartera_id, clave_hash, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?)', empresa, nombre, `Usuario ${nombre}`, rol, cartera, HASH, ahora).id;
  const ids = {
    empresa,
    norte,
    sur,
    admin: usuario('admin', 'administrador', norte),
    supervisor: usuario('supervisor', 'supervisor', null),
    empleado: usuario('empleado', 'empleado', norte),
    empleadoSur: usuario('empleadosur', 'empleado', sur),
  };
  const firmar = (id: number) => firmarToken({ usuarioId: id, empresaId: empresa }, config.jwtSecreto, 12);
  const token = {
    admin: await firmar(ids.admin),
    supervisor: await firmar(ids.supervisor),
    empleado: await firmar(ids.empleado),
    empleadoSur: await firmar(ids.empleadoSur),
  };

  async function api(tk: string | null, metodo: string, url: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<Respuesta> {
    const r = await app.inject({
      method: metodo as 'GET',
      url,
      headers: { ...(tk ? { authorization: `Bearer ${tk}` } : {}), ...cabeceras },
      ...(cuerpo !== undefined ? { payload: cuerpo as object } : {}),
    });
    return { estado: r.statusCode, cuerpo: r.body ? safeJson(r.body) : null };
  }

  return { app, db, deps, reloj, ids, token, api, cerrar: () => app.close() };
}

function safeJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

/** Afirma el código de estado y, si falla, muestra la respuesta para entender por qué. */
export function esperar(r: Respuesta, estado: number, codigo?: string): Respuesta {
  assert.equal(r.estado, estado, `se esperaba ${estado} y llegó ${r.estado}: ${JSON.stringify(r.cuerpo)}`);
  if (codigo) assert.equal(r.cuerpo?.error?.codigo, codigo);
  return r;
}

export const CLIENTE = {
  identificacion: '1010101010',
  nombres: 'Ana María',
  apellidos: 'Pérez Gómez',
  direccion: 'Calle 1 # 2-3',
  barrio: 'Centro',
  telefono: '3001234567',
  credito: { valorArticulo: 1000, utilidad: 20, cuotas: 20, periodo: 'DIARIO' },
};
