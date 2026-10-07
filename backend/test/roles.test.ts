// Especificación de roles de punta a punta (ver docs/roles.md).
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CLAVE, CLIENTE, esperar, type Entorno, nuevoEntorno } from './ayuda.ts';

let e: Entorno;
beforeEach(async () => {
  e = await nuevoEntorno();
});
afterEach(async () => {
  await e.cerrar();
});

/** Día abierto y 100.000 en la base: la situación normal de una jornada. */
async function jornadaLista(): Promise<void> {
  esperar(await e.api(e.token.admin, 'POST', '/api/v1/dia/abrir'), 200);
  esperar(await e.api(e.token.admin, 'POST', '/api/v1/base/movimientos', { tipo: 'ADICION', valor: 100000 }), 201);
}

async function crearClienteComoEmpleado(): Promise<{ clienteId: number; creditoId: number }> {
  const r = esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', CLIENTE), 201);
  return { clienteId: r.cuerpo.cliente.id, creditoId: r.cuerpo.credito.id };
}

describe('administrador', () => {
  it('crea usuarios con rol específico y esos usuarios pueden iniciar sesión', async () => {
    const creado = esperar(
      await e.api(e.token.admin, 'POST', '/api/v1/usuarios', { usuario: 'maria.sup', nombre: 'María Supervisora', rol: 'supervisor', clave: 'Segura2026' }),
      201,
    );
    assert.equal(creado.cuerpo.rol, 'supervisor');
    assert.equal(creado.cuerpo.clave_hash, undefined, 'nunca se devuelve el hash');

    const emp = esperar(
      await e.api(e.token.admin, 'POST', '/api/v1/usuarios', { usuario: 'pedro.emp', nombre: 'Pedro Empleado', rol: 'empleado', carteraId: e.ids.norte, clave: 'Segura2026' }),
      201,
    );
    assert.equal(emp.cuerpo.carteraId, e.ids.norte);

    const login = esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'maria.sup', contrasena: 'Segura2026' }), 200);
    assert.equal(login.cuerpo.usuario.rol, 'supervisor');
    assert.ok(login.cuerpo.token);
    assert.ok(login.cuerpo.permisos.includes('dia.gestionar'));
    assert.ok(!login.cuerpo.permisos.includes('base.ajustar'));
  });

  it('valida los datos al crear usuarios: duplicado, contraseña débil, empleado sin cartera', async () => {
    const base = { nombre: 'X', rol: 'supervisor', clave: 'Segura2026' };
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/usuarios', { ...base, usuario: 'admin' }), 409, 'USUARIO_DUPLICADO');
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/usuarios', { ...base, usuario: 'nuevo1', clave: '1234567' }), 400, 'CLAVE_DEBIL');
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/usuarios', { ...base, usuario: 'nuevo2', clave: 'soloLetrasAqui' }), 400, 'CLAVE_DEBIL');
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/usuarios', { ...base, usuario: 'nuevo3', rol: 'empleado' }), 400, 'CARTERA_REQUERIDA');
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/usuarios', { ...base, usuario: 'nuevo4', rol: 'dueño' }), 400);
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/usuarios', { ...base, usuario: 'n 5', rol: 'supervisor' }), 400, 'USUARIO_INVALIDO');
  });

  it('puede cambiar el rol y desactivar usuarios, pero no quedarse sin administradores ni bloquearse a sí mismo', async () => {
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/usuarios/${e.ids.empleado}`, { rol: 'supervisor' }), 200);
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/usuarios/${e.ids.admin}`, { activo: false }), 409, 'AUTOBLOQUEO');
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/usuarios/${e.ids.admin}`, { rol: 'supervisor' }), 409, 'AUTOBLOQUEO');
  });

  it('un usuario desactivado pierde el acceso de inmediato, aunque conserve su token', async () => {
    esperar(await e.api(e.token.empleado, 'GET', '/api/v1/clientes'), 200);
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/usuarios/${e.ids.empleado}`, { activo: false }), 200);
    esperar(await e.api(e.token.empleado, 'GET', '/api/v1/clientes'), 401, 'NO_AUTENTICADO');
    esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'empleado', contrasena: CLAVE }), 401, 'CREDENCIALES_INVALIDAS');
  });

  it('un cambio de rol se aplica en la siguiente petición', async () => {
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/dia/abrir'), 403);
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/usuarios/${e.ids.empleado}`, { rol: 'supervisor' }), 200);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/dia/abrir'), 200);
  });

  it('adiciona y retira dinero de la base; no puede retirar más de lo disponible', async () => {
    await jornadaLista();
    const retiro = esperar(await e.api(e.token.admin, 'POST', '/api/v1/base/movimientos', { tipo: 'RETIRO', valor: 30000, detalle: 'Retiro del dueño' }), 201);
    assert.equal(retiro.cuerpo.saldo, 70000);
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/base/movimientos', { tipo: 'RETIRO', valor: 70001 }), 409, 'BASE_INSUFICIENTE');
    const base = esperar(await e.api(e.token.admin, 'GET', '/api/v1/base'), 200);
    assert.equal(base.cuerpo.saldo, 70000);
    assert.equal(base.cuerpo.movimientos.length, 2);
  });

  it('edita todo: crédito recién vendido, cliente, calificación, enrutamiento, pagos y gastos', async () => {
    await jornadaLista();
    const { clienteId, creditoId } = await crearClienteComoEmpleado();

    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/clientes/${clienteId}`, { barrio: 'Norte Alto', calificacion: 'REGULAR' }), 200);
    const cli = esperar(await e.api(e.token.admin, 'GET', `/api/v1/clientes/${clienteId}`), 200);
    assert.equal(cli.cuerpo.barrio, 'Norte Alto');
    assert.equal(cli.cuerpo.calificacion, 'REGULAR');

    const nuevo = esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/creditos/${creditoId}`, { valorArticulo: 2000, utilidad: 10, cuotas: 10, periodo: 'DIARIO' }), 200);
    assert.equal(nuevo.cuerpo.total, 2200);
    assert.equal(nuevo.cuerpo.valorCuota, 220);

    esperar(await e.api(e.token.admin, 'PUT', '/api/v1/clientes/orden', { modo: 'PERSONALIZADO', orden: [clienteId] }), 204);

    const pago = esperar(await e.api(e.token.admin, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 220, forma: 'EF' }), 201);
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/pagos/${pago.cuerpo.pagoId}`, { valor: 200 }), 200);
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/creditos/${creditoId}`, { valorArticulo: 500, utilidad: 10, cuotas: 10, periodo: 'DIARIO' }), 409, 'CREDITO_CON_PAGOS');

    const gasto = esperar(await e.api(e.token.admin, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 5000 }), 201);
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/gastos/${gasto.cuerpo.id}`, { tipo: 'PARQUEADERO', valor: 4000, detalle: 'Corregido' }), 204);
    esperar(await e.api(e.token.admin, 'DELETE', `/api/v1/gastos/${gasto.cuerpo.id}`), 204);
  });

  it('administra carteras', async () => {
    const c = esperar(await e.api(e.token.admin, 'POST', '/api/v1/carteras', { nombre: 'Oriente' }), 201);
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/carteras', { nombre: 'Oriente' }), 409, 'CARTERA_DUPLICADA');
    esperar(await e.api(e.token.admin, 'PATCH', `/api/v1/carteras/${c.cuerpo.id}`, { activa: false }), 200);
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/carteras', { nombre: 'Otra' }), 403);
  });
});

describe('supervisor', () => {
  it('abre y cierra el día', async () => {
    const abierto = esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/dia/abrir', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200);
    assert.equal(abierto.cuerpo.estado, 'ABIERTO');
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/dia/abrir', undefined, { 'x-cartera-id': String(e.ids.norte) }), 409, 'DIA_YA_ABIERTO');
    const cerrado = esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/dia/cerrar', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200);
    assert.equal(cerrado.cuerpo.estado, 'CERRADO');
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/dia/cerrar', undefined, { 'x-cartera-id': String(e.ids.norte) }), 409, 'DIA_NO_ABIERTO');
    // Reabrir el día de hoy.
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/dia/abrir', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200);
  });

  it('ve la información de los clientes pero no puede crearlos ni editarlos', async () => {
    await jornadaLista();
    const { clienteId, creditoId } = await crearClienteComoEmpleado();
    const h = { 'x-cartera-id': String(e.ids.norte) };

    const lista = esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/clientes', undefined, h), 200);
    assert.equal(lista.cuerpo.items.length, 1);
    esperar(await e.api(e.token.supervisor, 'GET', `/api/v1/clientes/${clienteId}`), 200);
    esperar(await e.api(e.token.supervisor, 'GET', `/api/v1/creditos/${creditoId}`), 200);
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/creditos', undefined, h), 200);

    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/clientes', { ...CLIENTE, identificacion: '2020202020' }, h), 403);
    esperar(await e.api(e.token.supervisor, 'PATCH', `/api/v1/clientes/${clienteId}`, { barrio: 'X' }), 403);
    esperar(await e.api(e.token.supervisor, 'POST', `/api/v1/clientes/${clienteId}/referencias`, { nombres: 'A', direccion: 'B', barrio: 'C', telefono: '3000000000' }), 403);
    esperar(await e.api(e.token.supervisor, 'PUT', '/api/v1/clientes/orden', { modo: 'ALFABETICO' }, h), 403);
  });

  it('edita pagos (registrar, modificar, anular) y nada más', async () => {
    await jornadaLista();
    const { creditoId } = await crearClienteComoEmpleado();
    const h = { 'x-cartera-id': String(e.ids.norte) };

    const pago = esperar(await e.api(e.token.supervisor, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 201);
    const editado = esperar(await e.api(e.token.supervisor, 'PATCH', `/api/v1/pagos/${pago.cuerpo.pagoId}`, { valor: 100, forma: 'TR' }), 200);
    assert.equal(editado.cuerpo.saldo, 1100);
    esperar(await e.api(e.token.supervisor, 'DELETE', `/api/v1/pagos/${pago.cuerpo.pagoId}`), 200);

    // Lo demás es solo lectura.
    esperar(await e.api(e.token.supervisor, 'POST', `/api/v1/clientes/${1}/creditos`, CLIENTE.credito), 403);
    esperar(await e.api(e.token.supervisor, 'PATCH', `/api/v1/creditos/${creditoId}`, CLIENTE.credito), 403);
    esperar(await e.api(e.token.supervisor, 'DELETE', `/api/v1/creditos/${creditoId}`), 403);
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 1000 }, h), 403);
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/base/movimientos', { tipo: 'ADICION', valor: 1000 }, h), 403);
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/usuarios'), 403);
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/usuarios', { usuario: 'otro', nombre: 'O', rol: 'empleado', carteraId: e.ids.norte, clave: 'Segura2026' }), 403);
  });

  it('consulta los reportes', async () => {
    const h = { 'x-cartera-id': String(e.ids.norte) };
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/reportes/cierre', undefined, h), 200);
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/reportes/transacciones', undefined, h), 200);
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/gastos', undefined, h), 200);
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/notas', undefined, h), 200);
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/base', undefined, h), 200);
  });
});

describe('empleado', () => {
  it('crea clientes nuevos con su primer crédito, y los ve', async () => {
    await jornadaLista();
    const r = esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', CLIENTE), 201);
    assert.equal(r.cuerpo.credito.total, 1200);
    assert.equal(r.cuerpo.credito.valorCuota, 60);
    assert.equal(r.cuerpo.credito.primeraCuota, '2026-10-07');

    const lista = esperar(await e.api(e.token.empleado, 'GET', '/api/v1/clientes'), 200);
    assert.equal(lista.cuerpo.totalClientes, 1);
    assert.equal(lista.cuerpo.clientesActivos, 1);
    assert.equal(lista.cuerpo.items[0].vigentes, 1);

    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', CLIENTE), 409, 'CLIENTE_DUPLICADO');
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/clientes/${r.cuerpo.cliente.id}/referencias`, { nombres: 'Luis', direccion: 'Cra 5', barrio: 'Sur', telefono: '3010000000', detalle: 'Casa azul' }), 201);
  });

  it('adiciona pagos y gastos', async () => {
    await jornadaLista();
    const { creditoId } = await crearClienteComoEmpleado();
    const pago = esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'TR', nota: 'Pagó por Nequi' }), 201);
    assert.equal(pago.cuerpo.saldo, 1140);
    assert.equal(pago.cuerpo.cuotasPagadas, 1);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 8000, detalle: 'Gasolina de la ruta' }), 201);
    const notas = esperar(await e.api(e.token.empleado, 'GET', '/api/v1/notas'), 200);
    assert.equal(notas.cuerpo[0].texto, 'Pagó por Nequi');
  });

  it('no edita nada ya registrado ni hace tareas de supervisión o administración', async () => {
    await jornadaLista();
    const { clienteId, creditoId } = await crearClienteComoEmpleado();
    const pago = esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 201);
    const gasto = esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 1000 }), 201);

    esperar(await e.api(e.token.empleado, 'PATCH', `/api/v1/pagos/${pago.cuerpo.pagoId}`, { valor: 10 }), 403);
    esperar(await e.api(e.token.empleado, 'DELETE', `/api/v1/pagos/${pago.cuerpo.pagoId}`), 403);
    esperar(await e.api(e.token.empleado, 'PATCH', `/api/v1/gastos/${gasto.cuerpo.id}`, { tipo: 'COMBUSTIBLE', valor: 1 }), 403);
    esperar(await e.api(e.token.empleado, 'DELETE', `/api/v1/gastos/${gasto.cuerpo.id}`), 403);
    esperar(await e.api(e.token.empleado, 'PATCH', `/api/v1/clientes/${clienteId}`, { barrio: 'X' }), 403);
    esperar(await e.api(e.token.empleado, 'PUT', '/api/v1/clientes/orden', { modo: 'ALFABETICO' }), 403);
    esperar(await e.api(e.token.empleado, 'PATCH', `/api/v1/creditos/${creditoId}`, CLIENTE.credito), 403);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/dia/cerrar'), 403);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/dia/abrir'), 403);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/base/movimientos', { tipo: 'ADICION', valor: 1 }), 403);
    esperar(await e.api(e.token.empleado, 'GET', '/api/v1/usuarios'), 403);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/carteras', { nombre: 'X' }), 403);
  });

  it('no registra ventas nuevas a clientes ya existentes (la especificación no se lo concede)', async () => {
    await jornadaLista();
    const { clienteId } = await crearClienteComoEmpleado();
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/clientes/${clienteId}/creditos`, CLIENTE.credito), 403);
    esperar(await e.api(e.token.admin, 'POST', `/api/v1/clientes/${clienteId}/creditos`, CLIENTE.credito), 201);
  });

  it('solo ve su propia cartera y no puede salirse de ella', async () => {
    await jornadaLista();
    const { clienteId, creditoId } = await crearClienteComoEmpleado();
    // El empleado de la cartera Sur no ve nada de Norte, ni por identificador ni cambiando la cabecera.
    esperar(await e.api(e.token.empleadoSur, 'GET', `/api/v1/clientes/${clienteId}`), 404);
    esperar(await e.api(e.token.empleadoSur, 'GET', `/api/v1/creditos/${creditoId}`), 404);
    esperar(await e.api(e.token.empleadoSur, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 404);
    const propia = esperar(await e.api(e.token.empleadoSur, 'GET', '/api/v1/clientes', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200);
    assert.equal(propia.cuerpo.totalClientes, 0, 'la cabecera se ignora para el empleado: se le muestra su cartera (Sur)');
    // El supervisor sí puede mirar cualquier cartera de la empresa.
    const vista = esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/clientes', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200);
    assert.equal(vista.cuerpo.totalClientes, 1);
  });
});

describe('autenticación', () => {
  it('rechaza peticiones sin sesión o con token inválido', async () => {
    esperar(await e.api(null, 'GET', '/api/v1/clientes'), 401, 'NO_AUTENTICADO');
    esperar(await e.api('token-falso', 'GET', '/api/v1/clientes'), 401, 'NO_AUTENTICADO');
    esperar(await e.api(`${e.token.admin}x`, 'GET', '/api/v1/clientes'), 401, 'NO_AUTENTICADO');
    esperar(await e.api(null, 'GET', '/salud'), 200);
  });

  it('inicia sesión con código, usuario y contraseña; no distingue "usuario inexistente" de "contraseña errónea"', async () => {
    const ok = esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'admin', contrasena: CLAVE }), 200);
    assert.equal(ok.cuerpo.empresa.codigo, 'T1');
    const a = esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'admin', contrasena: 'incorrecta1' }), 401);
    const b = esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'fantasma', contrasena: 'incorrecta1' }), 401);
    const c = esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'ZZ', usuario: 'admin', contrasena: CLAVE }), 401);
    assert.deepEqual(a.cuerpo, b.cuerpo);
    assert.deepEqual(a.cuerpo, c.cuerpo);
  });

  it('bloquea el acceso tras 5 intentos fallidos', async () => {
    for (let i = 0; i < 5; i++) {
      esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'empleado', contrasena: 'incorrecta1' }), 401);
    }
    // Aunque ahora la contraseña sea correcta, sigue bloqueado.
    esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'empleado', contrasena: CLAVE }), 429, 'DEMASIADOS_INTENTOS');
    // Pasado el tiempo de bloqueo, vuelve a funcionar.
    e.reloj.avanzar(16 * 60_000);
    esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'empleado', contrasena: CLAVE }), 200);
  });

  it('cambia la propia contraseña exigiendo la actual y una nueva segura', async () => {
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/auth/cambiar-clave', { actual: 'mal', nueva: 'Nueva2026x' }), 400, 'CLAVE_ACTUAL_INCORRECTA');
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/auth/cambiar-clave', { actual: CLAVE, nueva: 'corta' }), 400, 'CLAVE_DEBIL');
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/auth/cambiar-clave', { actual: CLAVE, nueva: 'Nueva2026x' }), 204);
    esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'empleado', contrasena: CLAVE }), 401);
    esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: 'empleado', contrasena: 'Nueva2026x' }), 200);
  });
});
