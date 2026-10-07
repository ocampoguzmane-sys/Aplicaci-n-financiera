// Fechas de negocio en hora de Colombia (America/Bogota, UTC-5 fijo: Colombia no usa horario de verano).
// Las fechas de negocio se manejan como texto "YYYY-MM-DD"; los instantes, como ISO 8601 en UTC.

export const ZONA_HORARIA = 'America/Bogota';
const DESFASE_MS = -5 * 3_600_000;
const MS_DIA = 86_400_000;

export interface Reloj {
  ahora(): Date;
}

export const relojSistema: Reloj = { ahora: () => new Date() };

/** Reloj controlable, para pruebas. */
export function relojFijo(iso: string): Reloj & { avanzar(ms: number): void; fijar(iso: string): void } {
  let actual = new Date(iso);
  return {
    ahora: () => new Date(actual),
    avanzar(ms: number) {
      actual = new Date(actual.getTime() + ms);
    },
    fijar(nuevo: string) {
      actual = new Date(nuevo);
    },
  };
}

function formatearUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fecha de negocio (YYYY-MM-DD) en Colombia para un instante dado. */
export function fechaColombia(instante: Date): string {
  return formatearUTC(new Date(instante.getTime() + DESFASE_MS));
}

function aUTC(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return Date.UTC(a as number, (m as number) - 1, d as number);
}

export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  return formatearUTC(new Date(aUTC(fecha))) === fecha;
}

export function sumarDias(fecha: string, dias: number): string {
  return formatearUTC(new Date(aUTC(fecha) + dias * MS_DIA));
}

/** 0 = domingo … 6 = sábado. */
export function diaSemana(fecha: string): number {
  return new Date(aUTC(fecha)).getUTCDay();
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / MS_DIA);
}

export function instanteISO(instante: Date): string {
  return instante.toISOString();
}
