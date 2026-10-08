// La web (Flutter compilado) y la API viven bajo una sola dirección.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { construirApp } from '../src/app.ts';
import { cargarConfig, type Config } from '../src/config.ts';
import { abrirDb, todos } from '../src/db.ts';
import { altaInicialDesdeEntorno } from '../src/servicios/instalacion.ts';
import { esperar, nuevoEntorno, type Entorno } from './ayuda.ts';

let carpeta: string;
let e: Entorno;

const INDEX = '<!doctype html><html lang="es"><head><title>Financiera</title></head><body>app</body></html>';

beforeEach(async () => {
  carpeta = mkdtempSync(join(tmpdir(), 'web-'));
  mkdirSync(join(carpeta, 'assets'));
  writeFileSync(join(carpeta, 'index.html'), INDEX);
  writeFileSync(join(carpeta, 'main.dart.js'), `console.log("hola");\n${'x'.repeat(5000)}`);
  writeFileSync(join(carpeta, 'assets', 'datos.json'), '{"a":1}');
  writeFileSync(join(carpeta, 'motor.wasm'), Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]));
  writeFileSync(join(carpeta, '.secreto'), 'no se debe entregar');
  e = await nuevoEntorno();
});
afterEach(async () => {
  await e.cerrar();
  rmSync(carpeta, { recursive: true, force: true });
});

/** Misma empresa de prueba, pero con la web activada. */
async function conWeb(): Promise<Entorno & { get(url: string, cabeceras?: Record<string, string>): Promise<{ estado: number; cabeceras: Record<string, unknown>; texto: string }> }> {
  const config: Config = { ...e.deps.config, webDir: carpeta };
  const app = await construirApp({ db: e.db, config, reloj: e.reloj });
  const sobre = async (url: string, cabeceras: Record<string, string> = {}) => {
    const r = await app.inject({ method: 'GET', url, headers: cabeceras });
    return { estado: r.statusCode, cabeceras: r.headers as Record<string, unknown>, texto: r.body };
  };
  return Object.assign(e, { app, get: sobre });
}

describe('la web', () => {
  it('entrega la pantalla principal en "/" sin exigir sesión', async () => {
    const w = await conWeb();
    const r = await w.get('/');
    assert.equal(r.estado, 200);
    assert.match(String(r.cabeceras['content-type']), /text\/html/);
    assert.equal(r.texto, INDEX);
  });

  it('al recargar una ruta interna de la app, devuelve la pantalla principal', async () => {
    const w = await conWeb();
    for (const ruta of ['/clientes', '/pagos/12', '/reportes/cierre?fecha=2026-10-06']) {
      const r = await w.get(ruta);
      assert.equal(r.estado, 200, ruta);
      assert.equal(r.texto, INDEX, ruta);
    }
  });

  it('entrega los archivos con su tipo y siempre pide revalidar (las actualizaciones se ven de inmediato)', async () => {
    const w = await conWeb();
    const js = await w.get('/main.dart.js');
    assert.equal(js.estado, 200);
    assert.match(String(js.cabeceras['content-type']), /javascript/);
    assert.equal(js.cabeceras['cache-control'], 'no-cache');
    assert.ok(js.cabeceras.etag, 'tiene ETag para responder 304');
    const wasm = await w.get('/motor.wasm');
    assert.match(String(wasm.cabeceras['content-type']), /application\/wasm/);
    const json = await w.get('/assets/datos.json');
    assert.equal(json.estado, 200);
    // Un archivo sin cambios responde 304.
    const repetida = await w.get('/main.dart.js', { 'if-none-match': String(js.cabeceras.etag) });
    assert.equal(repetida.estado, 304);
  });

  it('un archivo que no existe responde 404 (no la pantalla principal)', async () => {
    const w = await conWeb();
    for (const ruta of ['/falta.js', '/assets/falta.png', '/favicon.ico']) assert.equal((await w.get(ruta)).estado, 404, ruta);
  });

  it('no entrega archivos ocultos ni sale de la carpeta', async () => {
    const w = await conWeb();
    assert.notEqual((await w.get('/.secreto')).texto, 'no se debe entregar');
    for (const ruta of ['/../package.json', '/..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/assets/../../package.json']) {
      const r = await w.get(ruta);
      assert.ok(!r.texto.includes('root:') && !r.texto.includes('"name"'), `${ruta} no debe filtrar archivos`);
    }
  });

  it('comprime los textos grandes', async () => {
    const w = await conWeb();
    const r = await w.get('/main.dart.js', { 'accept-encoding': 'gzip' });
    assert.equal(r.cabeceras['content-encoding'], 'gzip');
  });

  it('la web lleva política de contenido y cabeceras de seguridad; la API no se guarda en caché', async () => {
    const w = await conWeb();
    const pagina = await w.get('/');
    const csp = String(pagina.cabeceras['content-security-policy']);
    for (const parte of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "connect-src 'self'"]) assert.ok(csp.includes(parte), parte);
    assert.equal(pagina.cabeceras['x-frame-options'], 'DENY');
    assert.equal(pagina.cabeceras['x-content-type-options'], 'nosniff');
    assert.ok(pagina.cabeceras['cache-control'] !== 'no-store', 'la web sí se puede conservar para revalidar');

    const api = await w.api(w.token.admin, 'GET', '/api/v1/auth/me');
    assert.equal(api.estado, 200);
    const cruda = await w.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${w.token.admin}` } });
    assert.equal(cruda.headers['cache-control'], 'no-store');
    assert.equal(cruda.headers['content-security-policy'], undefined);
    assert.equal(cruda.headers['x-frame-options'], 'DENY');
  });

  it('la API sigue protegida y no se confunde con la web', async () => {
    const w = await conWeb();
    esperar(await w.api(null, 'GET', '/api/v1/clientes'), 401, 'NO_AUTENTICADO');
    // Una ruta de API inexistente responde JSON 404, no la pantalla principal.
    const r = esperar(await w.api(w.token.admin, 'GET', '/api/v1/no-existe'), 404, 'RUTA_NO_ENCONTRADA');
    assert.ok(typeof r.cuerpo === 'object');
    // El acceso sigue funcionando por la misma dirección.
    esperar(await w.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'admin', contrasena: 'incorrecta1' }), 401, 'CREDENCIALES_INVALIDAS');
    assert.equal((await w.get('/salud')).estado, 200);
  });

  it('solo se responde con la pantalla principal a navegaciones GET/HEAD, no a otros métodos', async () => {
    const w = await conWeb();
    const r = await w.app.inject({ method: 'POST', url: '/clientes', payload: {} });
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().error.codigo, 'RUTA_NO_ENCONTRADA');
  });

  it('sin carpeta de la web, "/" responde 404 JSON y la API funciona igual', async () => {
    const r = await e.app.inject({ method: 'GET', url: '/' });
    assert.equal(r.statusCode, 404);
    esperar(await e.api(e.token.admin, 'GET', '/api/v1/auth/me'), 200);
  });

  it('la configuración encuentra la carpeta indicada por WEB_DIR', () => {
    const c = cargarConfig({ NODE_ENV: 'test', JWT_SECRET: 'j'.repeat(40), WEB_DIR: carpeta } as NodeJS.ProcessEnv);
    assert.equal(c.webDir, carpeta);
    const sin = cargarConfig({ NODE_ENV: 'test', JWT_SECRET: 'j'.repeat(40), WEB_DIR: join(carpeta, 'nada') } as NodeJS.ProcessEnv);
    assert.ok(sin.webDir === null || sin.webDir !== join(carpeta, 'nada'));
  });
});

describe('alta inicial por variables de entorno (alojamiento sin consola)', () => {
  const VARIABLES = { ADMIN_CODIGO: '777', ADMIN_EMPRESA: 'Mi Empresa', ADMIN_USUARIO: 'jefe', ADMIN_NOMBRE: 'Jefe Principal', ADMIN_CLAVE: 'Inicial2026x' } as NodeJS.ProcessEnv;

  it('crea la empresa, la cartera y el administrador si la base está vacía', async () => {
    const db = abrirDb(':memory:');
    assert.equal(altaInicialDesdeEntorno(db, { ...VARIABLES, ADMIN_CARTERA: 'Ruta Uno' }), 'creada');
    const u = todos<{ usuario: string; rol: string; cartera: string }>(db, 'SELECT u.usuario, u.rol, c.nombre AS cartera FROM usuarios u JOIN carteras c ON c.id = u.cartera_id').map((f) => ({ ...f }));
    assert.deepEqual(u, [{ usuario: 'jefe', rol: 'administrador', cartera: 'Ruta Uno' }]);
    assert.ok(!JSON.stringify(todos(db, 'SELECT * FROM auditoria')).includes('Inicial2026x'));
  });

  it('el administrador creado puede iniciar sesión por la API', async () => {
    const db = abrirDb(':memory:');
    altaInicialDesdeEntorno(db, VARIABLES);
    const config: Config = { ...e.deps.config, webDir: null };
    const app = await construirApp({ db, config });
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { codigo: '777', usuario: 'jefe', contrasena: 'Inicial2026x' } });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().usuario.rol, 'administrador');
    await app.close();
  });

  it('no hace nada si ya existe una empresa (no sobrescribe ni duplica)', () => {
    const db = abrirDb(':memory:');
    assert.equal(altaInicialDesdeEntorno(db, VARIABLES), 'creada');
    assert.equal(altaInicialDesdeEntorno(db, { ...VARIABLES, ADMIN_CODIGO: '888', ADMIN_CLAVE: 'Otra2026clave' }), 'ya-existe');
    assert.equal(todos(db, 'SELECT id FROM empresas').length, 1);
  });

  it('no crea nada si faltan variables', () => {
    const db = abrirDb(':memory:');
    const { ADMIN_CLAVE: _omitida, ...incompletas } = VARIABLES;
    assert.equal(altaInicialDesdeEntorno(db, incompletas as NodeJS.ProcessEnv), 'sin-variables');
    assert.equal(altaInicialDesdeEntorno(db, {}), 'sin-variables');
    assert.equal(todos(db, 'SELECT id FROM empresas').length, 0);
  });

  it('se niega a crear el administrador con una contraseña débil y no deja nada a medias', () => {
    const db = abrirDb(':memory:');
    assert.throws(() => altaInicialDesdeEntorno(db, { ...VARIABLES, ADMIN_CLAVE: '1234' }), /contraseña/i);
    assert.equal(todos(db, 'SELECT id FROM empresas').length, 0);
  });
});
