// Catálogos del sistema de referencia (ver docs/radiografia.md).

export const UTILIDADES = [5, 7, 8, 10, 12, 14, 15, 20, 24, 26, 28, 30, 32, 36, 40, 50] as const;
export const CUOTAS = [1, 2, 3, 4, 6, 7, 8, 10, 11, 15, 20, 24, 30, 40, 42, 64, 90] as const;
export const UTILIDAD_POR_DEFECTO = 20;
export const CUOTAS_POR_DEFECTO = 20;

export type TipoPeriodo = 'DIARIO' | 'SEMANAL' | 'CADA_N_DIAS';

export interface Periodo {
  id: string;
  tipo: TipoPeriodo;
  /** Solo SEMANAL: 0 = domingo … 6 = sábado. */
  diaSemana?: number;
  /** Solo CADA_N_DIAS. */
  dias?: number;
}

export const PERIODOS: readonly Periodo[] = [
  { id: 'DIARIO', tipo: 'DIARIO' },
  { id: 'LUNES', tipo: 'SEMANAL', diaSemana: 1 },
  { id: 'MARTES', tipo: 'SEMANAL', diaSemana: 2 },
  { id: 'MIERCOLES', tipo: 'SEMANAL', diaSemana: 3 },
  { id: 'JUEVES', tipo: 'SEMANAL', diaSemana: 4 },
  { id: 'VIERNES', tipo: 'SEMANAL', diaSemana: 5 },
  { id: 'SABADO', tipo: 'SEMANAL', diaSemana: 6 },
  { id: 'DOMINGO', tipo: 'SEMANAL', diaSemana: 0 },
  { id: '10 DIAS', tipo: 'CADA_N_DIAS', dias: 10 },
  { id: '15 DIAS', tipo: 'CADA_N_DIAS', dias: 15 },
  { id: '20 DIAS', tipo: 'CADA_N_DIAS', dias: 20 },
  { id: '30 DIAS', tipo: 'CADA_N_DIAS', dias: 30 },
];

export const PERIODO_POR_DEFECTO = 'DIARIO';

export function buscarPeriodo(id: string): Periodo | undefined {
  return PERIODOS.find((p) => p.id === id);
}

export const TIPOS_GASTO = [
  'ARRENDAMIENTO',
  'AUXILIAR',
  'CADENA',
  'COMBUSTIBLE',
  'MANTENIMIENTO VEHICULO',
  'PARQUEADERO',
  'SALARIO',
  'SERVICIOS E INTERNET',
  'TARJETAS',
  'TELEFONO CELULAR',
] as const;

export const FORMAS_PAGO = ['EF', 'TR'] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];
export const ETIQUETA_FORMA: Record<FormaPago, string> = { EF: 'EFECTIVO', TR: 'TRANSFERENCIA' };

export const CALIFICACIONES = ['BUENO', 'REGULAR', 'MALO'] as const;
export type Calificacion = (typeof CALIFICACIONES)[number];

export const LARGO_MAXIMO_DETALLE = 100;
