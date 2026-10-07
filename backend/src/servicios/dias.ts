// Apertura y cierre del día por cartera. El día se cierra solo a las 00:00 de Colombia.
import { ahoraISO, auditar, type Deps, exigir, hoy, type Sesion } from '../contexto.ts';
import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { conflicto } from '../errores.ts';

export type EstadoDelDia = 'ABIERTO' | 'CERRADO' | 'SIN_ABRIR';

export interface InfoDia {
  fecha: string;
  estado: EstadoDelDia;
  abiertoEn: string | null;
  cerradoEn: string | null;
  cierreAutomatico: boolean;
}

interface FilaDia {
  id: number;
  fecha: string;
  estado: 'ABIERTO' | 'CERRADO';
  abierto_en: string | null;
  cerrado_en: string | null;
  cierre_automatico: number;
}

const filaDe = (deps: Deps, carteraId: number, fecha: string) =>
  uno<FilaDia>(deps.db, 'SELECT * FROM dias WHERE cartera_id = ? AND fecha = ?', carteraId, fecha);

export function estadoDelDia(deps: Deps, carteraId: number, fecha: string = hoy(deps)): InfoDia {
  const f = filaDe(deps, carteraId, fecha);
  if (!f) return { fecha, estado: 'SIN_ABRIR', abiertoEn: null, cerradoEn: null, cierreAutomatico: false };
  return { fecha, estado: f.estado, abiertoEn: f.abierto_en, cerradoEn: f.cerrado_en, cierreAutomatico: f.cierre_automatico === 1 };
}

/** Falla si el día de hoy no está abierto. Devuelve la fecha de negocio de hoy. */
export function exigirDiaAbierto(deps: Deps, carteraId: number): string {
  const fecha = hoy(deps);
  if (filaDe(deps, carteraId, fecha)?.estado !== 'ABIERTO') {
    throw conflicto('DIA_CERRADO', 'El día está cerrado. Pide a un supervisor o administrador que lo abra.');
  }
  return fecha;
}

export function abrirDia(deps: Deps, sesion: Sesion, carteraId: number): InfoDia {
  exigir(sesion, 'dia.gestionar');
  return transaccion(deps.db, () => {
    const fecha = hoy(deps);
    const actual = filaDe(deps, carteraId, fecha);
    if (actual?.estado === 'ABIERTO') throw conflicto('DIA_YA_ABIERTO', 'El día ya está abierto');
    if (actual) {
      ejecutar(
        deps.db,
        "UPDATE dias SET estado = 'ABIERTO', abierto_por = ?, abierto_en = ?, cerrado_por = NULL, cerrado_en = NULL, cierre_automatico = 0 WHERE id = ?",
        sesion.usuarioId,
        ahoraISO(deps),
        actual.id,
      );
      auditar(deps, sesion, 'dia.reabrir', 'dia', actual.id, { carteraId, fecha });
    } else {
      const { id } = ejecutar(
        deps.db,
        "INSERT INTO dias (empresa_id, cartera_id, fecha, estado, abierto_por, abierto_en) VALUES (?, ?, ?, 'ABIERTO', ?, ?)",
        sesion.empresaId,
        carteraId,
        fecha,
        sesion.usuarioId,
        ahoraISO(deps),
      );
      auditar(deps, sesion, 'dia.abrir', 'dia', id, { carteraId, fecha });
    }
    return estadoDelDia(deps, carteraId, fecha);
  });
}

export function cerrarDia(deps: Deps, sesion: Sesion, carteraId: number): InfoDia {
  exigir(sesion, 'dia.gestionar');
  return transaccion(deps.db, () => {
    const fecha = hoy(deps);
    const actual = filaDe(deps, carteraId, fecha);
    if (!actual || actual.estado !== 'ABIERTO') throw conflicto('DIA_NO_ABIERTO', 'El día no está abierto');
    ejecutar(deps.db, "UPDATE dias SET estado = 'CERRADO', cerrado_por = ?, cerrado_en = ?, cierre_automatico = 0 WHERE id = ?", sesion.usuarioId, ahoraISO(deps), actual.id);
    auditar(deps, sesion, 'dia.cerrar', 'dia', actual.id, { carteraId, fecha });
    return estadoDelDia(deps, carteraId, fecha);
  });
}

/**
 * Cierra todos los días que quedaron abiertos de fechas anteriores a hoy (hora de Colombia).
 * Lo ejecuta el planificador cada minuto; si el servidor estuvo apagado a medianoche, se pone al día al arrancar.
 */
export function cerrarDiasVencidos(deps: Deps): number {
  const fechaHoy = hoy(deps);
  return transaccion(deps.db, () => {
    const vencidos = todos<{ id: number; empresa_id: number; cartera_id: number; fecha: string }>(
      deps.db,
      "SELECT id, empresa_id, cartera_id, fecha FROM dias WHERE estado = 'ABIERTO' AND fecha < ?",
      fechaHoy,
    );
    for (const d of vencidos) {
      ejecutar(deps.db, "UPDATE dias SET estado = 'CERRADO', cerrado_en = ?, cierre_automatico = 1 WHERE id = ?", ahoraISO(deps), d.id);
      auditar(deps, { empresaId: d.empresa_id, usuarioId: 0 }, 'dia.cierre_automatico', 'dia', d.id, { carteraId: d.cartera_id, fecha: d.fecha });
    }
    return vencidos.length;
  });
}
