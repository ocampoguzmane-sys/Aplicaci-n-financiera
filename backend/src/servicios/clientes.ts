import { CALIFICACIONES, type Calificacion, LARGO_MAXIMO_DETALLE } from '../catalogos.ts';
import { ahoraISO, auditar, type Deps, exigir, exigirAccesoCartera, patronBusqueda, type Sesion } from '../contexto.ts';
import { ejecutar, todos, transaccion, uno } from '../db.ts';
import { conflicto, noEncontrado, solicitudInvalida } from '../errores.ts';
import { type CreditoCreado, type DatosVenta, insertarCredito } from './creditos.ts';
import { exigirDiaAbierto } from './dias.ts';

interface FilaCliente {
  id: number;
  empresa_id: number;
  cartera_id: number;
  identificacion: string;
  nombres: string;
  apellidos: string;
  direccion: string;
  barrio: string;
  telefono: string;
  calificacion: Calificacion;
  orden: number;
  creado_en: string;
}

export interface DatosCliente {
  identificacion: string;
  nombres: string;
  apellidos: string;
  direccion: string;
  barrio: string;
  telefono: string;
}

export interface ResumenCliente {
  id: number;
  nombre: string;
  identificacion: string;
  barrio: string;
  telefono: string;
  calificacion: Calificacion;
  vigentes: number;
  pagados: number;
  total: number;
  activo: boolean;
  orden: number;
}

export type FiltroClientes = 'todos' | 'activos' | 'inactivos';

export function listarClientes(
  deps: Deps,
  sesion: Sesion,
  carteraId: number,
  opciones: { estado?: FiltroClientes; busqueda?: string } = {},
): { totalClientes: number; clientesActivos: number; items: ResumenCliente[] } {
  exigir(sesion, 'clientes.ver');
  const q = opciones.busqueda?.trim();
  const filas = todos<FilaCliente & { vigentes: number; pagados: number }>(
    deps.db,
    `SELECT c.*,
            (SELECT COUNT(*) FROM creditos k WHERE k.cliente_id = c.id AND k.estado = 'VIGENTE') AS vigentes,
            (SELECT COUNT(*) FROM creditos k WHERE k.cliente_id = c.id AND k.estado = 'PAGADO') AS pagados
     FROM clientes c JOIN carteras r ON r.id = c.cartera_id
     WHERE c.cartera_id = ?
       AND (? IS NULL OR (c.nombres || ' ' || c.apellidos LIKE ? ESCAPE '\\' OR c.identificacion LIKE ? ESCAPE '\\' OR c.barrio LIKE ? ESCAPE '\\'))
     ORDER BY CASE WHEN r.orden_modo = 'PERSONALIZADO' THEN c.orden END, c.nombres COLLATE NOCASE, c.apellidos COLLATE NOCASE, c.id`,
    carteraId,
    q ? q : null,
    q ? patronBusqueda(q) : null,
    q ? patronBusqueda(q) : null,
    q ? patronBusqueda(q) : null,
  );
  const todosLosItems: ResumenCliente[] = filas.map((f) => ({
    id: f.id,
    nombre: `${f.nombres} ${f.apellidos}`,
    identificacion: f.identificacion,
    barrio: f.barrio,
    telefono: f.telefono,
    calificacion: f.calificacion,
    vigentes: f.vigentes,
    pagados: f.pagados,
    total: f.vigentes + f.pagados,
    activo: f.vigentes > 0,
    orden: f.orden,
  }));
  const estado = opciones.estado ?? 'todos';
  const items = todosLosItems.filter((c) => (estado === 'todos' ? true : estado === 'activos' ? c.activo : !c.activo));
  const conteo = uno<{ total: number; activos: number }>(
    deps.db,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM creditos k WHERE k.cliente_id = c.id AND k.estado = 'VIGENTE') THEN 1 ELSE 0 END) AS activos
     FROM clientes c WHERE c.cartera_id = ?`,
    carteraId,
  );
  return { totalClientes: conteo?.total ?? 0, clientesActivos: conteo?.activos ?? 0, items };
}

function cargarCliente(deps: Deps, sesion: Sesion, id: number): FilaCliente {
  const c = uno<FilaCliente>(deps.db, 'SELECT * FROM clientes WHERE id = ? AND empresa_id = ?', id, sesion.empresaId);
  if (!c) throw noEncontrado('Cliente');
  exigirAccesoCartera(sesion, c.cartera_id, 'Cliente');
  return c;
}

function limpiar(d: DatosCliente): DatosCliente {
  const l = {
    identificacion: d.identificacion.trim(),
    nombres: d.nombres.trim(),
    apellidos: d.apellidos.trim(),
    direccion: d.direccion.trim(),
    barrio: d.barrio.trim(),
    telefono: d.telefono.trim(),
  };
  if (!/^[A-Za-z0-9.-]{4,20}$/.test(l.identificacion)) throw solicitudInvalida('La identificación debe tener de 4 a 20 caracteres alfanuméricos', 'IDENTIFICACION_INVALIDA');
  if (!/^\+?[0-9 ()-]{6,20}$/.test(l.telefono)) throw solicitudInvalida('El teléfono no es válido', 'TELEFONO_INVALIDO');
  for (const [campo, valor] of Object.entries(l)) if (!valor) throw solicitudInvalida(`El campo ${campo} es obligatorio`, 'CAMPO_REQUERIDO');
  return l;
}

export interface ClienteCreado {
  cliente: { id: number; nombre: string };
  credito: CreditoCreado;
}

/** Crea el cliente junto con su primer crédito, como el sistema de referencia. */
export function crearCliente(deps: Deps, sesion: Sesion, carteraId: number, datos: DatosCliente, venta: DatosVenta): ClienteCreado {
  exigir(sesion, 'clientes.crear');
  const d = limpiar(datos);
  return transaccion(deps.db, () => {
    const fecha = exigirDiaAbierto(deps, carteraId);
    const existente = uno(deps.db, 'SELECT id FROM clientes WHERE cartera_id = ? AND identificacion = ?', carteraId, d.identificacion);
    if (existente) {
      throw conflicto('CLIENTE_DUPLICADO', `Ya existe un cliente con la identificación ${d.identificacion} en la cartera`);
    }
    const orden = (uno<{ m: number | null }>(deps.db, 'SELECT MAX(orden) AS m FROM clientes WHERE cartera_id = ?', carteraId)?.m ?? 0) + 1;
    const { id } = ejecutar(
      deps.db,
      `INSERT INTO clientes (empresa_id, cartera_id, identificacion, nombres, apellidos, direccion, barrio, telefono, orden, creado_por, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sesion.empresaId,
      carteraId,
      d.identificacion,
      d.nombres,
      d.apellidos,
      d.direccion,
      d.barrio,
      d.telefono,
      orden,
      sesion.usuarioId,
      ahoraISO(deps),
    );
    auditar(deps, sesion, 'cliente.crear', 'cliente', id, { carteraId });
    const credito = insertarCredito(deps, sesion, { id, empresa_id: sesion.empresaId, cartera_id: carteraId }, venta, fecha);
    return { cliente: { id, nombre: `${d.nombres} ${d.apellidos}` }, credito };
  });
}

export interface DetalleCliente {
  id: number;
  carteraId: number;
  identificacion: string;
  nombres: string;
  apellidos: string;
  direccion: string;
  barrio: string;
  telefono: string;
  calificacion: Calificacion;
  referencias: { id: number; nombres: string; direccion: string; barrio: string; telefono: string; detalle: string }[];
  creditos: { id: number; estado: string; fecha: string; total: number; periodo: string }[];
}

export function obtenerCliente(deps: Deps, sesion: Sesion, id: number): DetalleCliente {
  exigir(sesion, 'clientes.ver');
  const c = cargarCliente(deps, sesion, id);
  return {
    id: c.id,
    carteraId: c.cartera_id,
    identificacion: c.identificacion,
    nombres: c.nombres,
    apellidos: c.apellidos,
    direccion: c.direccion,
    barrio: c.barrio,
    telefono: c.telefono,
    calificacion: c.calificacion,
    referencias: todos(deps.db, 'SELECT id, nombres, direccion, barrio, telefono, detalle FROM referencias WHERE cliente_id = ? ORDER BY id', id),
    creditos: todos(deps.db, "SELECT id, estado, fecha, total, periodo FROM creditos WHERE cliente_id = ? AND estado <> 'ANULADO' ORDER BY id DESC", id),
  };
}

export function actualizarCliente(
  deps: Deps,
  sesion: Sesion,
  id: number,
  cambios: Partial<DatosCliente> & { calificacion?: Calificacion },
): DetalleCliente {
  exigir(sesion, 'clientes.editar');
  transaccion(deps.db, () => {
    const actual = cargarCliente(deps, sesion, id);
    const d = limpiar({
      identificacion: cambios.identificacion ?? actual.identificacion,
      nombres: cambios.nombres ?? actual.nombres,
      apellidos: cambios.apellidos ?? actual.apellidos,
      direccion: cambios.direccion ?? actual.direccion,
      barrio: cambios.barrio ?? actual.barrio,
      telefono: cambios.telefono ?? actual.telefono,
    });
    const calificacion = cambios.calificacion ?? actual.calificacion;
    if (!CALIFICACIONES.includes(calificacion)) throw solicitudInvalida('Calificación inválida', 'CALIFICACION_INVALIDA');
    if (uno(deps.db, 'SELECT id FROM clientes WHERE cartera_id = ? AND identificacion = ? AND id <> ?', actual.cartera_id, d.identificacion, id)) {
      throw conflicto('CLIENTE_DUPLICADO', `Ya existe un cliente con la identificación ${d.identificacion} en la cartera`);
    }
    ejecutar(
      deps.db,
      'UPDATE clientes SET identificacion = ?, nombres = ?, apellidos = ?, direccion = ?, barrio = ?, telefono = ?, calificacion = ? WHERE id = ?',
      d.identificacion,
      d.nombres,
      d.apellidos,
      d.direccion,
      d.barrio,
      d.telefono,
      calificacion,
      id,
    );
    auditar(deps, sesion, 'cliente.actualizar', 'cliente', id, { calificacion });
  });
  return obtenerCliente(deps, sesion, id);
}

export function crearReferencia(
  deps: Deps,
  sesion: Sesion,
  clienteId: number,
  datos: { nombres: string; direccion: string; barrio: string; telefono: string; detalle?: string },
): { id: number } {
  exigir(sesion, 'clientes.referencias.crear');
  const detalle = (datos.detalle ?? '').trim();
  if (detalle.length > LARGO_MAXIMO_DETALLE) throw solicitudInvalida(`La información adicional admite hasta ${LARGO_MAXIMO_DETALLE} caracteres`, 'DETALLE_LARGO');
  for (const campo of ['nombres', 'direccion', 'barrio', 'telefono'] as const) {
    if (!datos[campo].trim()) throw solicitudInvalida(`El campo ${campo} es obligatorio`, 'CAMPO_REQUERIDO');
  }
  return transaccion(deps.db, () => {
    cargarCliente(deps, sesion, clienteId);
    const { id } = ejecutar(
      deps.db,
      'INSERT INTO referencias (cliente_id, nombres, direccion, barrio, telefono, detalle, creado_por, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      clienteId,
      datos.nombres.trim(),
      datos.direccion.trim(),
      datos.barrio.trim(),
      datos.telefono.trim(),
      detalle,
      sesion.usuarioId,
      ahoraISO(deps),
    );
    auditar(deps, sesion, 'cliente.referencia', 'cliente', clienteId, { referenciaId: id });
    return { id };
  });
}

/** Enrutamiento: orden alfabético o personalizado de la ruta. */
export function enrutar(
  deps: Deps,
  sesion: Sesion,
  carteraId: number,
  datos: { modo: 'ALFABETICO' | 'PERSONALIZADO'; orden?: number[] },
): void {
  exigir(sesion, 'clientes.enrutar');
  transaccion(deps.db, () => {
    if (datos.modo === 'PERSONALIZADO') {
      const ids = datos.orden ?? [];
      if (ids.length === 0 || new Set(ids).size !== ids.length) throw solicitudInvalida('El orden personalizado requiere una lista sin repetidos', 'ORDEN_INVALIDO');
      const existentes = new Set(todos<{ id: number }>(deps.db, 'SELECT id FROM clientes WHERE cartera_id = ?', carteraId).map((c) => c.id));
      if (!ids.every((id) => existentes.has(id))) throw solicitudInvalida('El orden incluye clientes que no son de la cartera', 'ORDEN_INVALIDO');
      let posicion = 1;
      for (const id of ids) ejecutar(deps.db, 'UPDATE clientes SET orden = ? WHERE id = ?', posicion++, id);
      // Los clientes que no vinieron en la lista quedan al final, conservando su orden relativo.
      for (const c of todos<{ id: number }>(deps.db, 'SELECT id FROM clientes WHERE cartera_id = ? AND id NOT IN (' + ids.map(() => '?').join(',') + ') ORDER BY orden, id', carteraId, ...ids)) {
        ejecutar(deps.db, 'UPDATE clientes SET orden = ? WHERE id = ?', posicion++, c.id);
      }
    }
    ejecutar(deps.db, 'UPDATE carteras SET orden_modo = ? WHERE id = ? AND empresa_id = ?', datos.modo, carteraId, sesion.empresaId);
    auditar(deps, sesion, 'cartera.enrutar', 'cartera', carteraId, { modo: datos.modo });
  });
}
