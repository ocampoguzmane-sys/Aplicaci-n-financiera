// Cálculo de créditos y cronogramas. Todo el dinero se maneja en pesos enteros (sin decimales).
import { buscarPeriodo } from './catalogos.ts';
import { diaSemana, sumarDias } from './tiempo.ts';

export interface Condiciones {
  interes: number;
  total: number;
  valorCuota: number;
}

export interface Cuota {
  numero: number;
  valor: number;
  saldo: number;
  fecha: string;
}

export interface Cronograma extends Condiciones {
  cuotas: Cuota[];
  primeraCuota: string;
  vence: string;
}

/**
 * interés = capital × tasa / 100, total = capital + interés, cuota = total / n.
 * Los pesos se redondean al entero más cercano; la última cuota absorbe la diferencia.
 */
export function calcularCondiciones(capital: number, tasa: number, cuotas: number): Condiciones {
  if (!Number.isInteger(capital) || capital < 1) throw new RangeError('El capital debe ser un entero positivo');
  if (!Number.isInteger(cuotas) || cuotas < 1) throw new RangeError('El número de cuotas debe ser un entero positivo');
  if (!Number.isFinite(tasa) || tasa < 0) throw new RangeError('La tasa no es válida');
  const interes = Math.round((capital * tasa) / 100);
  const total = capital + interes;
  return { interes, total, valorCuota: Math.round(total / cuotas) };
}

/** Siguiente día de cobro de un crédito DIARIO: el día siguiente, omitiendo los domingos. */
function siguienteDiaHabil(fecha: string): string {
  let siguiente = sumarDias(fecha, 1);
  if (diaSemana(siguiente) === 0) siguiente = sumarDias(siguiente, 1);
  return siguiente;
}

/** Fechas de cobro de las `cantidad` cuotas de un crédito vendido en `fechaVenta`. */
export function fechasDeCuotas(periodoId: string, cantidad: number, fechaVenta: string): string[] {
  const periodo = buscarPeriodo(periodoId);
  if (!periodo) throw new RangeError(`Periodo desconocido: ${periodoId}`);
  const fechas: string[] = [];
  if (periodo.tipo === 'DIARIO') {
    let fecha = fechaVenta;
    for (let i = 0; i < cantidad; i++) {
      fecha = siguienteDiaHabil(fecha);
      fechas.push(fecha);
    }
  } else if (periodo.tipo === 'SEMANAL') {
    // Primer día de cobro: el próximo día de la semana indicado, contando el mismo día de la venta.
    const espera = (((periodo.diaSemana as number) - diaSemana(fechaVenta)) % 7 + 7) % 7;
    const primera = sumarDias(fechaVenta, espera);
    for (let i = 0; i < cantidad; i++) fechas.push(sumarDias(primera, i * 7));
  } else {
    const paso = periodo.dias as number;
    for (let i = 0; i < cantidad; i++) fechas.push(sumarDias(fechaVenta, paso * (i + 1)));
  }
  return fechas;
}

export function calcularCronograma(
  capital: number,
  tasa: number,
  cuotas: number,
  periodoId: string,
  fechaVenta: string,
): Cronograma {
  const condiciones = calcularCondiciones(capital, tasa, cuotas);
  const fechas = fechasDeCuotas(periodoId, cuotas, fechaVenta);
  let saldo = condiciones.total;
  const lista: Cuota[] = fechas.map((fecha, i) => {
    const numero = i + 1;
    const valor = numero === cuotas ? saldo : Math.min(condiciones.valorCuota, saldo);
    saldo -= valor;
    return { numero, valor, saldo: Math.max(saldo, 0), fecha };
  });
  return {
    ...condiciones,
    cuotas: lista,
    primeraCuota: fechas[0] as string,
    vence: fechas[fechas.length - 1] as string,
  };
}

/** Cuotas pagadas (aproximado) = abonos / valor de cuota, con dos decimales. */
export function cuotasPagadas(totalAbonos: number, valorCuota: number): number {
  if (valorCuota <= 0) return 0;
  return Math.round((totalAbonos / valorCuota) * 100) / 100;
}

/** ¿Hay cobro para este crédito en `fecha`? Sirve para el valor a recaudar del día. */
export function esDiaDeCobro(periodoId: string, primeraCuota: string, fecha: string): boolean {
  const periodo = buscarPeriodo(periodoId);
  if (!periodo || fecha < primeraCuota) return false;
  if (periodo.tipo === 'DIARIO') return diaSemana(fecha) !== 0;
  if (periodo.tipo === 'SEMANAL') return diaSemana(fecha) === periodo.diaSemana;
  const paso = periodo.dias as number;
  const dias = Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${primeraCuota}T00:00:00Z`)) / 86_400_000);
  return dias % paso === 0;
}
