import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { firmarToken } from '../src/auth.ts';
import { todos } from '../src/db.ts';
import { cerrarDiasVencidos } from '../src/servicios/dias.ts';
import { crearEmpresaConAdministrador } from '../src/servicios/instalacion.ts';
import { CLIENTE, esperar, type Entorno, nuevoEntorno } from './ayuda.ts';

let e: Entorno;
beforeEach(async () => {
  e = await nuevoEntorno();
});
afterEach(async () => {
  await e.cerrar();
});

const abrirDia = async () => esperar(await e.api(e.token.admin, 'POST', '/api/v1/dia/abrir'), 200);
const base = async (valor: number) => esperar(await e.api(e.token.admin, 'POST', '/api/v1/base/movimientos', { tipo: 'ADICION', valor }), 201);
async function venderCliente(identificacion = CLIENTE.identificacion, credito = CLIENTE.credito) {
  const r = esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', { ...CLIENTE, identificacion, credito }), 201);
  return { clienteId: r.cuerpo.cliente.id as number, creditoId: r.cuerpo.credito.id as number };
}
const MEDIANOCHE_COLOMBIA = '2026-10-07T05:00:00.000Z'; // 00:00 del 7-oct en Bogotá

describe('el día', () => {
  it('acepta POST sin cuerpo aunque el cliente envíe content-type JSON (como hace la app)', async () => {
    const r = await e.app.inject({ method: 'POST', url: '/api/v1/dia/abrir', headers: { authorization: `Bearer ${e.token.admin}`, 'content-type': 'application/json' } });
    assert.equal(r.statusCode, 200, r.body);
    const cerrar = await e.app.inject({ method: 'POST', url: '/api/v1/dia/cerrar', headers: { authorization: `Bearer ${e.token.admin}`, 'content-type': 'application/json' }, payload: '' });
    assert.equal(cerrar.statusCode, 200, cerrar.body);
  });

  it('rechaza claves peligrosas en el JSON', async () => {
    const r = await e.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'content-type': 'application/json' }, payload: '{"codigo":"T1","usuario":"admin","contrasena":"x","__proto__":{"rol":"administrador"}}' });
    assert.equal(r.statusCode, 400);
  });

  it('sin día abierto no se puede registrar nada', async () => {
    const h = { 'x-cartera-id': String(e.ids.norte) };
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', CLIENTE), 409, 'DIA_CERRADO');
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 1000 }), 409, 'DIA_CERRADO');
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/base/movimientos', { tipo: 'ADICION', valor: 1000 }, h), 409, 'DIA_CERRADO');
  });

  it('al cerrar el día se bloquean pagos, gastos y ventas; al reabrirlo se desbloquean', async () => {
    await abrirDia();
    await base(50000);
    const { clienteId, creditoId } = await venderCliente();
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/dia/cerrar', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200);

    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 409, 'DIA_CERRADO');
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 1000 }), 409, 'DIA_CERRADO');
    esperar(await e.api(e.token.admin, 'POST', `/api/v1/clientes/${clienteId}/creditos`, CLIENTE.credito), 409, 'DIA_CERRADO');

    await abrirDia();
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 201);
  });

  it('a las 00:00 de Colombia el día se cierra solo; un minuto antes sigue abierto', async () => {
    await abrirDia();
    e.reloj.fijar('2026-10-07T04:59:30.000Z'); // 23:59:30 en Bogotá: en UTC ya es el 7, en Colombia sigue siendo el 6
    assert.equal(cerrarDiasVencidos(e.deps), 0);
    const antes = (await e.api(e.token.admin, 'GET', '/api/v1/dia', undefined, { 'x-cartera-id': String(e.ids.norte) })).cuerpo;
    assert.equal(antes.fecha, '2026-10-06');
    assert.equal(antes.estado, 'ABIERTO');

    e.reloj.fijar(MEDIANOCHE_COLOMBIA);
    assert.equal(cerrarDiasVencidos(e.deps), 1);
    const cerrado = (await e.api(e.token.admin, 'GET', '/api/v1/reportes/cierre', undefined, { 'x-cartera-id': String(e.ids.norte) }));
    esperar(cerrado, 200);
    const filas = todos<{ estado: string; cierre_automatico: number; fecha: string }>(e.db, 'SELECT estado, cierre_automatico, fecha FROM dias').map((f) => ({ ...f }));
    assert.deepEqual(filas, [{ estado: 'CERRADO', cierre_automatico: 1, fecha: '2026-10-06' }]);
    assert.equal(cerrarDiasVencidos(e.deps), 0, 'es idempotente');
  });

  it('al día siguiente hay que abrir de nuevo; el día anterior ya no se puede tocar', async () => {
    await abrirDia();
    await base(50000);
    const { creditoId } = await venderCliente();
    const pago = esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 201);

    e.reloj.fijar(MEDIANOCHE_COLOMBIA);
    cerrarDiasVencidos(e.deps);

    const dia = esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/dia', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200).cuerpo;
    assert.equal(dia.fecha, '2026-10-07');
    assert.equal(dia.estado, 'SIN_ABRIR');
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 409, 'DIA_CERRADO');

    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/dia/abrir', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200);
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 201);
    // El pago de ayer pertenece a un día cerrado: ni el supervisor ni el administrador lo modifican.
    esperar(await e.api(e.token.supervisor, 'PATCH', `/api/v1/pagos/${pago.cuerpo.pagoId}`, { valor: 10 }), 409, 'DIA_CERRADO');
    esperar(await e.api(e.token.admin, 'DELETE', `/api/v1/pagos/${pago.cuerpo.pagoId}`), 409, 'DIA_CERRADO');
  });

  it('si el servidor estuvo apagado varios días, al arrancar cierra todo lo vencido', async () => {
    await abrirDia();
    e.reloj.fijar('2026-10-10T15:00:00.000Z');
    assert.equal(cerrarDiasVencidos(e.deps), 1);
  });

  it('cada cartera tiene su propio día', async () => {
    await abrirDia(); // Norte
    esperar(await e.api(e.token.empleadoSur, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 1000 }), 409, 'DIA_CERRADO');
    esperar(await e.api(e.token.supervisor, 'POST', '/api/v1/dia/abrir', undefined, { 'x-cartera-id': String(e.ids.sur) }), 200);
    esperar(await e.api(e.token.empleadoSur, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 1000 }), 201);
  });

  it('el administrador sin cartera por defecto debe indicar cuál', async () => {
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/dia'), 400, 'CARTERA_REQUERIDA');
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/dia', undefined, { 'x-cartera-id': '99999' }), 404);
    esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/dia', undefined, { 'x-cartera-id': 'abc' }), 400);
  });
});

describe('base y cierre', () => {
  it('el total del día = base + adiciones − retiros + recaudos − ventas − gastos', async () => {
    await abrirDia();
    await base(10000);
    esperar(await e.api(e.token.admin, 'POST', '/api/v1/base/movimientos', { tipo: 'RETIRO', valor: 500 }), 201);
    const { creditoId } = await venderCliente(); // entrega 1.000 de capital; total a cobrar 1.200
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 201);
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 90, forma: 'TR' }), 201);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 100 }), 201);

    const c = esperar(await e.api(e.token.empleado, 'GET', '/api/v1/reportes/cierre'), 200).cuerpo;
    assert.equal(c.fecha, '2026-10-06');
    assert.equal(c.estado, 'ABIERTO');
    assert.equal(c.base, 0);
    assert.equal(c.adiciones, 10000);
    assert.equal(c.retiros, 500);
    assert.deepEqual(c.recaudos, { total: 150, efectivo: 60, transferencia: 90 });
    assert.equal(c.ventas, 1000);
    assert.equal(c.gastos, 100);
    assert.equal(c.totalDia, 0 + 10000 - 500 + 150 - 1000 - 100);
    assert.equal(c.utilidadDiariaAprox, 25, '150 × 20 / 120');
    assert.equal((await e.api(e.token.admin, 'GET', '/api/v1/base')).cuerpo.saldo, c.totalDia);
  });

  it('la base inicial de un día es el total del día anterior; la efectividad compara con lo que había por cobrar', async () => {
    await abrirDia();
    await base(10000);
    const { creditoId } = await venderCliente();
    const dia1 = esperar(await e.api(e.token.admin, 'GET', '/api/v1/reportes/cierre'), 200).cuerpo;
    assert.equal(dia1.totalDia, 9000);
    assert.equal(dia1.valorARecaudar, 0, 'el crédito se vendió hoy: aún no hay cuota por cobrar');
    assert.equal(dia1.efectividadRecaudo, null);

    e.reloj.fijar(MEDIANOCHE_COLOMBIA);
    cerrarDiasVencidos(e.deps);
    await abrirDia();
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 30, forma: 'EF' }), 201);

    const dia2 = esperar(await e.api(e.token.admin, 'GET', '/api/v1/reportes/cierre'), 200).cuerpo;
    assert.equal(dia2.fecha, '2026-10-07');
    assert.equal(dia2.base, 9000);
    assert.equal(dia2.valorARecaudar, 60, 'primera cuota: miércoles 7-oct');
    assert.equal(dia2.efectividadRecaudo, 50);
    assert.equal(dia2.totalDia, 9030);
    // El cierre de un día pasado no cambia con lo que ocurre después.
    const antes = esperar(await e.api(e.token.admin, 'GET', '/api/v1/reportes/cierre?fecha=2026-10-06'), 200).cuerpo;
    assert.equal(antes.totalDia, 9000);
    assert.equal(antes.estado, 'CERRADO');
  });

  it('la efectividad puede ser del 100 % y no hay cobro los domingos', async () => {
    await abrirDia();
    const { creditoId } = await venderCliente();
    e.reloj.fijar('2026-10-07T15:00:00.000Z');
    cerrarDiasVencidos(e.deps);
    await abrirDia();
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'TR' }), 201);
    assert.equal((await e.api(e.token.admin, 'GET', '/api/v1/reportes/cierre')).cuerpo.efectividadRecaudo, 100);
    const domingo = (await e.api(e.token.admin, 'GET', '/api/v1/reportes/cierre?fecha=2026-10-11')).cuerpo;
    assert.equal(domingo.valorARecaudar, 0);
  });

  it('la base inicial de la cartera Sur no se mezcla con la de Norte', async () => {
    await abrirDia();
    await base(5000);
    const sur = (await e.api(e.token.empleadoSur, 'GET', '/api/v1/reportes/cierre')).cuerpo;
    assert.equal(sur.adiciones, 0);
    assert.equal(sur.totalDia, 0);
  });
});

describe('pagos y créditos', () => {
  it('el crédito se paga completo: queda PAGADO, el cliente pasa a inactivo y no admite más pagos', async () => {
    await abrirDia();
    const { clienteId, creditoId } = await venderCliente();
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 1201, forma: 'EF' }), 409, 'PAGO_EXCEDE_SALDO');
    const final = esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 1200, forma: 'EF' }), 201).cuerpo;
    assert.equal(final.saldo, 0);
    assert.equal(final.creditoEstado, 'PAGADO');
    assert.equal(final.cuotasPagadas, 20);
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 1, forma: 'EF' }), 409, 'CREDITO_NO_VIGENTE');

    assert.equal((await e.api(e.token.empleado, 'GET', '/api/v1/creditos')).cuerpo.creditosVigentes, 0);
    const inactivos = (await e.api(e.token.empleado, 'GET', '/api/v1/clientes?estado=inactivos')).cuerpo;
    assert.equal(inactivos.items.length, 1);
    assert.equal(inactivos.items[0].id, clienteId);
    assert.equal(inactivos.items[0].pagados, 1);
    assert.equal(inactivos.clientesActivos, 0);

    // Anular ese pago final devuelve el crédito a vigente.
    const pagoId = final.pagoId;
    esperar(await e.api(e.token.supervisor, 'DELETE', `/api/v1/pagos/${pagoId}`), 200);
    assert.equal((await e.api(e.token.empleado, 'GET', '/api/v1/creditos')).cuerpo.creditosVigentes, 1);
  });

  it('valida el valor y la forma de pago', async () => {
    await abrirDia();
    const { creditoId } = await venderCliente();
    const url = `/api/v1/creditos/${creditoId}/pagos`;
    esperar(await e.api(e.token.empleado, 'POST', url, { valor: 0, forma: 'EF' }), 400);
    esperar(await e.api(e.token.empleado, 'POST', url, { valor: -5, forma: 'EF' }), 400);
    esperar(await e.api(e.token.empleado, 'POST', url, { valor: 10.5, forma: 'EF' }), 400);
    esperar(await e.api(e.token.empleado, 'POST', url, { valor: 10, forma: 'CHEQUE' }), 400);
    esperar(await e.api(e.token.empleado, 'POST', url, { valor: '10', forma: 'EF' }), 400);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/creditos/99999/pagos', { valor: 10, forma: 'EF' }), 404);
  });

  it('el informe del crédito muestra los pagos con su saldo corrido', async () => {
    await abrirDia();
    const { creditoId } = await venderCliente();
    for (const valor of [60, 60, 100]) esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor, forma: 'TR' }), 201);
    const r = esperar(await e.api(e.token.supervisor, 'GET', `/api/v1/creditos/${creditoId}`), 200).cuerpo;
    assert.deepEqual(
      { capital: r.capital, intereses: r.intereses, tasa: r.tasa, cuotas: r.cuotas, valorCuota: r.valorCuota, valorTotal: r.valorTotal, saldo: r.saldo, totalAbonos: r.totalAbonos, nPagos: r.nPagos },
      { capital: 1000, intereses: 200, tasa: 20, cuotas: 20, valorCuota: 60, valorTotal: 1200, saldo: 980, totalAbonos: 220, nPagos: 3 },
    );
    assert.equal(r.cuotasPagadas, 3.67);
    assert.deepEqual(r.pagos.map((p: any) => p.saldo), [1140, 1080, 980]);
    assert.equal(r.vence, '2026-10-29', '20 cuotas diarias sin domingos (11, 18 y 25) desde el 7-oct');
    assert.equal(r.historial.length, 1);
  });

  it('un pago editado queda marcado como modificado y el saldo se recalcula', async () => {
    await abrirDia();
    const { creditoId } = await venderCliente();
    const p = esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 100, forma: 'EF' }), 201).cuerpo;
    const r = esperar(await e.api(e.token.supervisor, 'PATCH', `/api/v1/pagos/${p.pagoId}`, { valor: 40 }), 200).cuerpo;
    assert.equal(r.saldo, 1160);
    const informe = (await e.api(e.token.supervisor, 'GET', `/api/v1/creditos/${creditoId}`)).cuerpo;
    assert.equal(informe.pagos[0].modificado, true);
    esperar(await e.api(e.token.supervisor, 'PATCH', `/api/v1/pagos/${p.pagoId}`, { valor: 5000 }), 409, 'PAGO_EXCEDE_SALDO');
    esperar(await e.api(e.token.supervisor, 'PATCH', `/api/v1/pagos/${p.pagoId}`, {}), 400, 'SIN_CAMBIOS');
  });

  it('el reporte de transacciones lista pagos, créditos y gastos del día', async () => {
    await abrirDia();
    const { creditoId } = await venderCliente();
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 201);
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'TR' }), 201);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'SALARIO', valor: 700, detalle: 'Auxiliar' }), 201);
    const t = esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/reportes/transacciones', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200).cuerpo;
    assert.deepEqual({ total: t.pagos.total, ef: t.pagos.efectivo, tr: t.pagos.transferencia }, { total: 120, ef: 60, tr: 60 });
    assert.deepEqual(t.pagos.items.map((p: any) => [p.numeroPago, p.saldo, p.forma]), [[1, 1140, 'EF'], [2, 1080, 'TR']]);
    assert.equal(t.creditos.items.length, 1);
    assert.equal(t.creditos.total, 1000);
    assert.equal(t.gastos.total, 700);
    assert.equal(t.gastos.items[0].tipo, 'SALARIO');
  });
});

describe('créditos: validaciones', () => {
  it('solo acepta utilidades, cuotas y periodos del catálogo', async () => {
    await abrirDia();
    const intento = (credito: object) => e.api(e.token.empleado, 'POST', '/api/v1/clientes', { ...CLIENTE, credito });
    esperar(await intento({ ...CLIENTE.credito, utilidad: 13 }), 400, 'UTILIDAD_INVALIDA');
    esperar(await intento({ ...CLIENTE.credito, cuotas: 5 }), 400, 'CUOTAS_INVALIDAS');
    esperar(await intento({ ...CLIENTE.credito, periodo: 'QUINCENAL' }), 400, 'PERIODO_INVALIDO');
    esperar(await intento({ ...CLIENTE.credito, valorArticulo: 0 }), 400);
    esperar(await intento({ ...CLIENTE.credito, valorArticulo: 99.5 }), 400);
    esperar(await e.api(e.token.empleado, 'GET', '/api/v1/clientes'), 200);
    assert.equal((await e.api(e.token.empleado, 'GET', '/api/v1/clientes')).cuerpo.totalClientes, 0, 'una venta inválida no deja cliente a medias');
  });

  it('el alta de cliente es atómica: si el crédito falla no queda el cliente', async () => {
    await abrirDia();
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', { ...CLIENTE, credito: { ...CLIENTE.credito, periodo: 'XX' } }), 400);
    assert.equal(todos(e.db, 'SELECT id FROM clientes').length, 0);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', CLIENTE), 201);
    assert.equal(todos(e.db, 'SELECT id FROM clientes').length, 1);
  });

  it('periodos semanales y cada N días generan la fecha de vencimiento correcta', async () => {
    await abrirDia();
    const sab = await venderCliente('111111', { valorArticulo: 5000, utilidad: 20, cuotas: 4, periodo: 'SABADO' });
    const informe = (await e.api(e.token.admin, 'GET', `/api/v1/creditos/${sab.creditoId}`)).cuerpo;
    assert.equal(informe.valorCuota, 1500);
    assert.equal(informe.vence, '2026-10-31', 'sábados 10, 17, 24 y 31 de octubre');
    const diez = await venderCliente('222222', { valorArticulo: 3000, utilidad: 10, cuotas: 3, periodo: '10 DIAS' });
    assert.equal((await e.api(e.token.admin, 'GET', `/api/v1/creditos/${diez.creditoId}`)).cuerpo.vence, '2026-11-05');
  });
});

describe('clientes: listados', () => {
  it('busca por nombre, identificación o barrio, y escapa los comodines', async () => {
    await abrirDia();
    await venderCliente('1001');
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', { ...CLIENTE, identificacion: '1002', nombres: 'Carlos', apellidos: 'Ruiz', barrio: 'Las Palmas' }), 201);
    const buscar = async (q: string) => (await e.api(e.token.empleado, 'GET', `/api/v1/clientes?q=${encodeURIComponent(q)}`)).cuerpo.items.length;
    assert.equal(await buscar('carlos'), 1);
    assert.equal(await buscar('1001'), 1);
    assert.equal(await buscar('palmas'), 1);
    assert.equal(await buscar('ana mar'), 1);
    assert.equal(await buscar('%'), 0, '"%" no es un comodín');
    assert.equal(await buscar('zzz'), 0);
  });

  it('enrutamiento: orden alfabético o personalizado', async () => {
    await abrirDia();
    const a = await venderCliente('1001'); // Ana María
    const b = esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', { ...CLIENTE, identificacion: '1002', nombres: 'Beatriz' }), 201).cuerpo.cliente.id;
    const c = esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', { ...CLIENTE, identificacion: '1003', nombres: 'Carlos' }), 201).cuerpo.cliente.id;
    const nombres = async () => (await e.api(e.token.empleado, 'GET', '/api/v1/clientes')).cuerpo.items.map((x: any) => x.nombre.split(' ')[0]);
    assert.deepEqual(await nombres(), ['Ana', 'Beatriz', 'Carlos']);
    esperar(await e.api(e.token.admin, 'PUT', '/api/v1/clientes/orden', { modo: 'PERSONALIZADO', orden: [c, a.clienteId, b] }), 204);
    assert.deepEqual(await nombres(), ['Carlos', 'Ana', 'Beatriz']);
    esperar(await e.api(e.token.admin, 'PUT', '/api/v1/clientes/orden', { modo: 'PERSONALIZADO', orden: [c, c] }), 400, 'ORDEN_INVALIDO');
    esperar(await e.api(e.token.admin, 'PUT', '/api/v1/clientes/orden', { modo: 'PERSONALIZADO', orden: [99999] }), 400, 'ORDEN_INVALIDO');
    esperar(await e.api(e.token.admin, 'PUT', '/api/v1/clientes/orden', { modo: 'ALFABETICO' }), 204);
    assert.deepEqual(await nombres(), ['Ana', 'Beatriz', 'Carlos']);
  });
});

describe('gastos', () => {
  it('registra, consulta por rango y valida', async () => {
    await abrirDia();
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 8000, detalle: 'Gasolina de la ruta' }), 201);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'PARQUEADERO', valor: 2000 }), 201);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'INVENTADO', valor: 2000 }), 400);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 2000, detalle: 'x'.repeat(101) }), 400);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/gastos', { tipo: 'COMBUSTIBLE', valor: 0 }), 400);
    const r = esperar(await e.api(e.token.supervisor, 'GET', '/api/v1/gastos?desde=2026-10-01&hasta=2026-10-31', undefined, { 'x-cartera-id': String(e.ids.norte) }), 200).cuerpo;
    assert.equal(r.total, 10000);
    assert.equal(r.items.length, 2);
    esperar(await e.api(e.token.empleado, 'GET', '/api/v1/gastos?desde=2026-10-31&hasta=2026-10-01'), 400, 'RANGO_INVALIDO');
    esperar(await e.api(e.token.empleado, 'GET', '/api/v1/gastos?desde=2025-01-01&hasta=2026-10-01'), 400, 'RANGO_INVALIDO');
    esperar(await e.api(e.token.empleado, 'GET', '/api/v1/gastos?desde=31-10-2026'), 400);
  });
});

describe('simulador', () => {
  it('calcula igual que el sistema de referencia: 1.000 al 20 % en 20 cuotas → 1.200, cuota 60', async () => {
    const r = esperar(await e.api(e.token.empleado, 'POST', '/api/v1/simulador', { valorArticulo: 1000, utilidad: 20, cuotas: 20, periodo: 'DIARIO' }), 200).cuerpo;
    assert.equal(r.total, 1200);
    assert.equal(r.interes, 200);
    assert.equal(r.valorCuota, 60);
    assert.equal(r.cuotas.length, 20);
    assert.equal(r.cuotas[0].fecha, '2026-10-07');
    assert.equal(r.cuotas[0].saldo, 1140);
    assert.equal(r.cuotas[19].saldo, 0);
    assert.ok(r.cuotas.every((c: any) => new Date(`${c.fecha}T00:00:00Z`).getUTCDay() !== 0), 'ninguna cuota cae en domingo');
    assert.equal(r.vence, '2026-10-29');
  });

  it('no guarda nada y está disponible para los tres roles', async () => {
    const antes = todos(e.db, 'SELECT id FROM creditos').length;
    for (const t of [e.token.admin, e.token.supervisor, e.token.empleado]) {
      esperar(await e.api(t, 'POST', '/api/v1/simulador', { valorArticulo: 500, utilidad: 10, cuotas: 10, periodo: 'LUNES' }), 200);
    }
    assert.equal(todos(e.db, 'SELECT id FROM creditos').length, antes);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/simulador', { valorArticulo: 500, utilidad: 11, cuotas: 10, periodo: 'LUNES' }), 400);
  });
});

describe('seguridad', () => {
  it('una empresa no ve ni toca los datos de otra', async () => {
    await abrirDia();
    const { clienteId, creditoId } = await venderCliente();
    const otra = crearEmpresaConAdministrador(e.db, { codigo: 'T2', empresa: 'Otra', carteraNombre: 'Única', usuario: 'jefe', nombre: 'Jefe', clave: 'Segura2026' });
    const tokenOtra = await firmarToken({ usuarioId: otra.usuarioId, empresaId: otra.empresaId }, e.deps.config.jwtSecreto, 1);
    esperar(await e.api(tokenOtra, 'GET', `/api/v1/clientes/${clienteId}`), 404);
    esperar(await e.api(tokenOtra, 'GET', `/api/v1/creditos/${creditoId}`), 404);
    esperar(await e.api(tokenOtra, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 10, forma: 'EF' }), 404);
    esperar(await e.api(tokenOtra, 'GET', '/api/v1/clientes', undefined, { 'x-cartera-id': String(e.ids.norte) }), 404);
    assert.equal((await e.api(tokenOtra, 'GET', '/api/v1/usuarios')).cuerpo.length, 1);
    // Un token de la empresa B con el usuario de la A tampoco sirve.
    const mezclado = await firmarToken({ usuarioId: e.ids.admin, empresaId: otra.empresaId }, e.deps.config.jwtSecreto, 1);
    esperar(await e.api(mezclado, 'GET', '/api/v1/usuarios'), 401);
  });

  it('las inyecciones SQL no tienen efecto', async () => {
    await abrirDia();
    await venderCliente();
    const mala = "x' OR '1'='1";
    assert.equal((await e.api(e.token.empleado, 'GET', `/api/v1/clientes?q=${encodeURIComponent(mala)}`)).cuerpo.items.length, 0);
    esperar(await e.api(null, 'POST', '/api/v1/auth/login', { codigo: 'T1', usuario: "admin' --", contrasena: 'cualquiera1' }), 401);
    esperar(await e.api(e.token.empleado, 'POST', '/api/v1/clientes', { ...CLIENTE, identificacion: "9'; DROP TABLE clientes;--" }), 400);
    assert.equal(todos(e.db, 'SELECT id FROM clientes').length, 1);
  });

  it('rechaza JSON mal formado y rutas inexistentes sin filtrar detalles internos', async () => {
    const r = await e.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'content-type': 'application/json' }, payload: '{no es json' });
    assert.equal(r.statusCode, 400);
    assert.ok(!JSON.stringify(r.body).includes('node_modules'));
    esperar(await e.api(e.token.admin, 'GET', '/api/v1/no-existe'), 404, 'RUTA_NO_ENCONTRADA');
  });

  it('deja un registro de auditoría de lo que se hace', async () => {
    await abrirDia();
    const { creditoId } = await venderCliente();
    esperar(await e.api(e.token.empleado, 'POST', `/api/v1/creditos/${creditoId}/pagos`, { valor: 60, forma: 'EF' }), 201);
    const acciones = todos<{ accion: string; usuario_id: number }>(e.db, 'SELECT accion, usuario_id FROM auditoria ORDER BY id').map((a) => a.accion);
    for (const esperada of ['dia.abrir', 'cliente.crear', 'credito.crear', 'pago.registrar']) assert.ok(acciones.includes(esperada), esperada);
    const pago = todos<{ usuario_id: number }>(e.db, "SELECT usuario_id FROM auditoria WHERE accion = 'pago.registrar'")[0];
    assert.equal(pago?.usuario_id, e.ids.empleado);
  });

  it('las respuestas no se almacenan en caché y no exponen hashes de contraseña', async () => {
    const r = await e.app.inject({ method: 'GET', url: '/api/v1/usuarios', headers: { authorization: `Bearer ${e.token.admin}` } });
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.ok(!r.body.includes('scrypt'));
  });
});
