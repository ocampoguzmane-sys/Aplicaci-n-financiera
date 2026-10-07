export class ErrorApp extends Error {
  readonly estado: number;
  readonly codigo: string;

  constructor(estado: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

export const noEncontrado = (que: string) => new ErrorApp(404, 'NO_ENCONTRADO', `${que} no encontrado`);
export const prohibido = (mensaje = 'No tienes permiso para esta acción') => new ErrorApp(403, 'PROHIBIDO', mensaje);
export const solicitudInvalida = (mensaje: string, codigo = 'SOLICITUD_INVALIDA') => new ErrorApp(400, codigo, mensaje);
export const conflicto = (codigo: string, mensaje: string) => new ErrorApp(409, codigo, mensaje);
