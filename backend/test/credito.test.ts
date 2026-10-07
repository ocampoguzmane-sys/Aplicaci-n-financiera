import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calcularCondiciones, calcularCronograma, cuotasPagadas, esDiaDeCobro, fechasDeCuotas } from '../src/credito.ts';
import { diaSemana, esFechaValida, fechaColombia, sumarDias } from '../src/tiempo.ts';

describe('condiciones del crédito', () => {
  it('capital 1.000 al 20 % en 20 cuotas: total 1.200, cuota 60, interés 200', () => {
    assert.deepEqual(calcularCondiciones(1000, 20, 20), { interes: 200, total: 1200, valorCuota: 60 });
  });

  it('capital 1.200 al 20 % en 24 cuotas: total 1.440, cuota 60 (crédito observado en el sistema de referencia)', () => {
    assert.deepEqual(calcularCondiciones(1200, 20, 24), { interes: 240, total: 1440, valorCuota: 60 });
  });

  it('redondea al peso más cercano', () => {
    assert.deepEqual(calcularCondiciones(333, 8, 7), { interes: 27, total: 360, valorCuota: 51 });
  });

  it('rechaza valores inválidos', () => {
    assert.throws(() => calcularCondiciones(0, 20, 20), RangeError);
    assert.throws(() => calcularCondiciones(1000.5, 20, 20), RangeError);
    assert.throws(() => calcularCondiciones(1000, 20, 0), RangeError);
    assert.throws(() => calcularCondiciones(1000, -1, 20), RangeError);
  });
});

describe('cronograma', () => {
  it('la suma de las cuotas siempre es igual al total, aunque no sea divisible', () => {
    const c = calcularCronograma(1000, 15, 7, 'DIARIO', '2026-10-06');
    assert.equal(c.total, 1150);
    assert.equal(c.cuotas.reduce((s, x) => s + x.valor, 0), 1150);
    assert.equal(c.cuotas.at(-1)?.saldo, 0);
    assert.equal(c.cuotas.length, 7);
  });

  it('los saldos bajan cuota a cuota hasta cero', () => {
    const c = calcularCronograma(1000, 20, 20, 'DIARIO', '2026-10-06');
    assert.equal(c.cuotas[0]?.saldo, 1140);
    assert.equal(c.cuotas[1]?.saldo, 1080);
    assert.equal(c.cuotas[19]?.saldo, 0);
  });

  it('DIARIO: empieza el día siguiente y omite domingos', () => {
    // 2026-10-03 es sábado: la primera cuota es el lunes 5 (se omite el domingo 4).
    assert.equal(diaSemana('2026-10-03'), 6);
    const fechas = fechasDeCuotas('DIARIO', 3, '2026-10-03');
    assert.deepEqual(fechas, ['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('DIARIO: vencimiento observado en el sistema de referencia (venta 29-sep-2026, 24 cuotas → 27-oct-2026)', () => {
    const c = calcularCronograma(1200, 20, 24, 'DIARIO', '2026-09-29');
    assert.equal(c.primeraCuota, '2026-09-30');
    assert.equal(c.vence, '2026-10-27');
  });

  it('DIARIO: vencimiento observado (venta sábado 13-dic-2025, 24 cuotas → 10-ene-2026)', () => {
    const c = calcularCronograma(1000, 20, 24, 'DIARIO', '2025-12-13');
    assert.equal(c.primeraCuota, '2025-12-15');
    assert.equal(c.vence, '2026-01-10');
  });

  it('SEMANAL: primera cuota en el próximo día indicado y luego cada 7 días', () => {
    // 2026-10-06 es martes. SABADO → 10 de octubre.
    assert.deepEqual(fechasDeCuotas('SABADO', 3, '2026-10-06'), ['2026-10-10', '2026-10-17', '2026-10-24']);
    // Si el día coincide con la venta, cuenta ese mismo día.
    assert.deepEqual(fechasDeCuotas('MARTES', 2, '2026-10-06'), ['2026-10-06', '2026-10-13']);
    // DOMINGO desde un martes: el próximo domingo.
    assert.deepEqual(fechasDeCuotas('DOMINGO', 2, '2026-10-06'), ['2026-10-11', '2026-10-18']);
    // LUNES desde un domingo: al día siguiente.
    assert.deepEqual(fechasDeCuotas('LUNES', 1, '2026-10-04'), ['2026-10-05']);
  });

  it('CADA N DIAS: una cuota cada N días a partir de N días después de la venta', () => {
    assert.deepEqual(fechasDeCuotas('10 DIAS', 3, '2026-10-06'), ['2026-10-16', '2026-10-26', '2026-11-05']);
    assert.deepEqual(fechasDeCuotas('15 DIAS', 2, '2026-10-06'), ['2026-10-21', '2026-11-05']);
  });

  it('rechaza un periodo desconocido', () => {
    assert.throws(() => fechasDeCuotas('QUINCENAL', 2, '2026-10-06'), RangeError);
  });
});

describe('cuotas pagadas y días de cobro', () => {
  it('cuotas pagadas = abonos / valor de cuota con dos decimales', () => {
    assert.equal(cuotasPagadas(300, 60), 5);
    assert.equal(cuotasPagadas(2400, 1500), 1.6); // caso observado: 2 pagos, 1,60 cuotas
    assert.equal(cuotasPagadas(6942, 320), 21.69); // caso observado
    assert.equal(cuotasPagadas(100, 0), 0);
  });

  it('día de cobro según el periodo', () => {
    assert.equal(esDiaDeCobro('DIARIO', '2026-10-05', '2026-10-06'), true);
    assert.equal(esDiaDeCobro('DIARIO', '2026-10-05', '2026-10-11'), false); // domingo
    assert.equal(esDiaDeCobro('DIARIO', '2026-10-05', '2026-10-04'), false); // antes de la primera cuota
    assert.equal(esDiaDeCobro('SABADO', '2026-10-10', '2026-10-17'), true);
    assert.equal(esDiaDeCobro('SABADO', '2026-10-10', '2026-10-16'), false);
    assert.equal(esDiaDeCobro('10 DIAS', '2026-10-16', '2026-10-26'), true);
    assert.equal(esDiaDeCobro('10 DIAS', '2026-10-16', '2026-10-25'), false);
  });
});

describe('fechas en hora de Colombia', () => {
  it('a las 23:30 de Colombia sigue siendo el mismo día; a las 00:00 cambia', () => {
    assert.equal(fechaColombia(new Date('2026-10-07T04:59:59Z')), '2026-10-06'); // 23:59:59 en Bogotá
    assert.equal(fechaColombia(new Date('2026-10-07T05:00:00Z')), '2026-10-07'); // 00:00:00 en Bogotá
  });

  it('suma días cruzando meses y valida fechas', () => {
    assert.equal(sumarDias('2026-10-30', 3), '2026-11-02');
    assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
    assert.equal(esFechaValida('2026-02-29'), false);
    assert.equal(esFechaValida('2026-10-07'), true);
    assert.equal(esFechaValida('07/10/2026'), false);
  });
});
