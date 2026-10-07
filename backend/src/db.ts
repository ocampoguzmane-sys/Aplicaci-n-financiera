import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;
export type Param = string | number | bigint | null;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  creada_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carteras (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  nombre TEXT NOT NULL,
  orden_modo TEXT NOT NULL DEFAULT 'ALFABETICO' CHECK (orden_modo IN ('ALFABETICO','PERSONALIZADO')),
  activa INTEGER NOT NULL DEFAULT 1,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  usuario TEXT NOT NULL,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('administrador','supervisor','empleado')),
  cartera_id INTEGER REFERENCES carteras(id),
  clave_hash TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  UNIQUE (empresa_id, usuario)
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cartera_id INTEGER NOT NULL REFERENCES carteras(id),
  identificacion TEXT NOT NULL,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  direccion TEXT NOT NULL,
  barrio TEXT NOT NULL,
  telefono TEXT NOT NULL,
  calificacion TEXT NOT NULL DEFAULT 'BUENO' CHECK (calificacion IN ('BUENO','REGULAR','MALO')),
  orden INTEGER NOT NULL DEFAULT 0,
  creado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TEXT NOT NULL,
  UNIQUE (cartera_id, identificacion)
);
CREATE INDEX IF NOT EXISTS idx_clientes_cartera ON clientes(cartera_id);

CREATE TABLE IF NOT EXISTS referencias (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  nombres TEXT NOT NULL,
  direccion TEXT NOT NULL,
  barrio TEXT NOT NULL,
  telefono TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT '',
  creado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS creditos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cartera_id INTEGER NOT NULL REFERENCES carteras(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  capital INTEGER NOT NULL CHECK (capital > 0),
  tasa INTEGER NOT NULL CHECK (tasa >= 0),
  cuotas INTEGER NOT NULL CHECK (cuotas > 0),
  valor_cuota INTEGER NOT NULL CHECK (valor_cuota > 0),
  interes INTEGER NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),
  periodo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  primera_cuota TEXT NOT NULL,
  vence TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE','PAGADO','ANULADO')),
  creado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creditos_cliente ON creditos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_creditos_cartera_estado ON creditos(cartera_id, estado);
CREATE INDEX IF NOT EXISTS idx_creditos_fecha ON creditos(cartera_id, fecha);

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cartera_id INTEGER NOT NULL REFERENCES carteras(id),
  credito_id INTEGER NOT NULL REFERENCES creditos(id),
  valor INTEGER NOT NULL CHECK (valor > 0),
  forma TEXT NOT NULL CHECK (forma IN ('EF','TR')),
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  modificado INTEGER NOT NULL DEFAULT 0,
  modificado_por INTEGER REFERENCES usuarios(id),
  modificado_en TEXT,
  anulado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pagos_credito ON pagos(credito_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cartera_fecha ON pagos(cartera_id, fecha);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cartera_id INTEGER NOT NULL REFERENCES carteras(id),
  tipo TEXT NOT NULL,
  valor INTEGER NOT NULL CHECK (valor > 0),
  detalle TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  anulado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gastos_cartera_fecha ON gastos(cartera_id, fecha);

CREATE TABLE IF NOT EXISTS notas (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cartera_id INTEGER NOT NULL REFERENCES carteras(id),
  credito_id INTEGER NOT NULL REFERENCES creditos(id),
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  texto TEXT NOT NULL,
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_notas_cartera_fecha ON notas(cartera_id, fecha);

CREATE TABLE IF NOT EXISTS base_movimientos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cartera_id INTEGER NOT NULL REFERENCES carteras(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ADICION','RETIRO')),
  valor INTEGER NOT NULL CHECK (valor > 0),
  detalle TEXT NOT NULL DEFAULT '',
  fecha TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_base_cartera_fecha ON base_movimientos(cartera_id, fecha);

CREATE TABLE IF NOT EXISTS dias (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  cartera_id INTEGER NOT NULL REFERENCES carteras(id),
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('ABIERTO','CERRADO')),
  abierto_por INTEGER REFERENCES usuarios(id),
  abierto_en TEXT,
  cerrado_por INTEGER REFERENCES usuarios(id),
  cerrado_en TEXT,
  cierre_automatico INTEGER NOT NULL DEFAULT 0,
  UNIQUE (cartera_id, fecha)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  usuario_id INTEGER,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id INTEGER,
  detalle TEXT NOT NULL DEFAULT '{}',
  creado_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id, id);
`;

export function abrirDb(ruta: string): Db {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON');
  if (ruta !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(ESQUEMA);
  return db;
}

export function uno<T>(db: Db, sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function todos<T>(db: Db, sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function ejecutar(db: Db, sql: string, ...params: Param[]): { cambios: number; id: number } {
  const r = db.prepare(sql).run(...params);
  return { cambios: Number(r.changes), id: Number(r.lastInsertRowid) };
}

/** Ejecuta `fn` dentro de una transacción; si lanza, se revierte todo. */
export function transaccion<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
