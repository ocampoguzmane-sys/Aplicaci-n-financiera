import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { ErrorApp, solicitudInvalida } from './errores.ts';

// ---------------------------------------------------------------- contraseñas

const N = 16384;
const LARGO_CLAVE = 64;

export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(clave, sal, LARGO_CLAVE, { N });
  return `scrypt$${N}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function verificarClave(clave: string, almacenado: string): boolean {
  const [esquema, n, sal, hash] = almacenado.split('$');
  if (esquema !== 'scrypt' || !n || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = scryptSync(clave, Buffer.from(sal, 'base64'), esperado.length, { N: Number(n) });
  return timingSafeEqual(calculado, esperado);
}

/** Hash de relleno: se verifica contra él cuando el usuario no existe, para no revelar su existencia por tiempo de respuesta. */
export const HASH_RELLENO = hashClave(randomBytes(12).toString('hex'));

export function validarPoliticaClave(clave: string, usuario?: string): void {
  if (clave.length < 8) throw solicitudInvalida('La contraseña debe tener al menos 8 caracteres', 'CLAVE_DEBIL');
  if (clave.length > 128) throw solicitudInvalida('La contraseña es demasiado larga', 'CLAVE_DEBIL');
  if (!/[A-Za-z]/.test(clave) || !/\d/.test(clave)) {
    throw solicitudInvalida('La contraseña debe combinar letras y números', 'CLAVE_DEBIL');
  }
  if (usuario && clave.toLowerCase() === usuario.toLowerCase()) {
    throw solicitudInvalida('La contraseña no puede ser igual al usuario', 'CLAVE_DEBIL');
  }
}

// ---------------------------------------------------------------- tokens

export interface PayloadToken {
  usuarioId: number;
  empresaId: number;
}

export async function firmarToken(payload: PayloadToken, secreto: string, horas: number): Promise<string> {
  return new SignJWT({ emp: payload.empresaId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.usuarioId))
    .setIssuedAt()
    .setExpirationTime(`${horas}h`)
    .sign(new TextEncoder().encode(secreto));
}

export async function verificarToken(token: string, secreto: string): Promise<PayloadToken> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secreto), { algorithms: ['HS256'] });
    const usuarioId = Number(payload.sub);
    const empresaId = Number(payload.emp);
    if (!Number.isInteger(usuarioId) || !Number.isInteger(empresaId)) throw new Error('payload');
    return { usuarioId, empresaId };
  } catch {
    throw new ErrorApp(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida');
  }
}

// ---------------------------------------------------------------- bloqueo por intentos fallidos

interface Registro {
  fallos: number;
  bloqueadoHasta: number;
}

/** Bloquea un usuario tras varios intentos fallidos seguidos. En memoria: se reinicia con el servidor. */
export class LimitadorLogin {
  private readonly registros = new Map<string, Registro>();
  private readonly maxFallos: number;
  private readonly bloqueoMs: number;

  constructor(maxFallos = 5, bloqueoMs = 15 * 60_000) {
    this.maxFallos = maxFallos;
    this.bloqueoMs = bloqueoMs;
  }

  comprobar(clave: string, ahora: number): void {
    const r = this.registros.get(clave);
    if (r && r.bloqueadoHasta > ahora) {
      const minutos = Math.ceil((r.bloqueadoHasta - ahora) / 60_000);
      throw new ErrorApp(429, 'DEMASIADOS_INTENTOS', `Demasiados intentos fallidos. Intenta de nuevo en ${minutos} min`);
    }
  }

  fallo(clave: string, ahora: number): void {
    const r = this.registros.get(clave) ?? { fallos: 0, bloqueadoHasta: 0 };
    if (r.bloqueadoHasta <= ahora && r.bloqueadoHasta !== 0) r.fallos = 0; // el bloqueo ya venció
    r.fallos += 1;
    if (r.fallos >= this.maxFallos) {
      r.bloqueadoHasta = ahora + this.bloqueoMs;
      r.fallos = 0;
    }
    this.registros.set(clave, r);
  }

  exito(clave: string): void {
    this.registros.delete(clave);
  }
}
