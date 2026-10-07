import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { firmarToken, type LimitadorLogin } from './auth.ts';
import { CALIFICACIONES, CUOTAS, CUOTAS_POR_DEFECTO, ETIQUETA_FORMA, FORMAS_PAGO, PERIODO_POR_DEFECTO, PERIODOS, TIPOS_GASTO, UTILIDAD_POR_DEFECTO, UTILIDADES } from './catalogos.ts';
import { type Deps, hoy, resolverCartera, type Sesion } from './contexto.ts';
import { solicitudInvalida } from './errores.ts';
import { PERMISOS, ROLES } from './permissions.ts';
import { ajustarBase, consultarBase } from './servicios/base.ts';
import { actualizarCartera, crearCartera, listarCarteras } from './servicios/carteras.ts';
import { actualizarCliente, crearCliente, crearReferencia, enrutar, listarClientes, obtenerCliente } from './servicios/clientes.ts';
import { anularCredito, editarCredito, informeCredito, listarVigentes, vender } from './servicios/creditos.ts';
import { abrirDia, cerrarDia, estadoDelDia } from './servicios/dias.ts';
import { anularGasto, consultarGastos, editarGasto, registrarGasto } from './servicios/gastos.ts';
import { anularPago, editarPago, registrarPago } from './servicios/pagos.ts';
import { cierre, historialNotas, simular, transacciones } from './servicios/reportes.ts';
import { actualizarUsuario, cambiarClave, crearUsuario, iniciarSesion, listarUsuarios, obtenerPerfil } from './servicios/usuarios.ts';

declare module 'fastify' {
  interface FastifyRequest {
    sesion: Sesion;
  }
}

const id = z.coerce.number().int().positive();
const texto = (max: number) => z.string().trim().min(1).max(max);
const entero = z.number().int();

const esquemaVenta = z.object({
  valorArticulo: entero.positive(),
  utilidad: entero.min(0),
  cuotas: entero.positive(),
  periodo: z.string().min(1).max(20),
});

const esquemaCliente = z.object({
  identificacion: texto(20),
  nombres: texto(60),
  apellidos: texto(60),
  direccion: texto(120),
  barrio: texto(60),
  telefono: texto(20),
});

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function parsear<T>(esquema: z.ZodType<T>, datos: unknown): T {
  const r = esquema.safeParse(datos);
  if (r.success) return r.data;
  const mensaje = r.error.issues.map((i) => `${i.path.join('.') || 'solicitud'}: ${i.message}`).join('; ');
  throw solicitudInvalida(mensaje);
}

function carteraSolicitada(req: FastifyRequest): number | null {
  const crudo = req.headers['x-cartera-id'];
  if (crudo === undefined || Array.isArray(crudo) || crudo === '') return null;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < 1) throw solicitudInvalida('X-Cartera-Id inválido', 'CARTERA_INVALIDA');
  return n;
}

export function registrarRutas(app: FastifyInstance, deps: Deps, limitador: LimitadorLogin): void {
  const cartera = (req: FastifyRequest): number => resolverCartera(deps, req.sesion, carteraSolicitada(req));

  app.get('/salud', async () => ({ ok: true, hora: deps.reloj.ahora().toISOString() }));

  // ------------------------------------------------------------ autenticación
  app.post('/api/v1/auth/login', async (req) => {
    const d = parsear(z.object({ codigo: texto(20), usuario: texto(30), contrasena: z.string().min(1).max(128) }), req.body);
    const r = iniciarSesion(deps, limitador, { codigo: d.codigo, usuario: d.usuario, clave: d.contrasena });
    const token = await firmarToken({ usuarioId: r.sesion.usuarioId, empresaId: r.sesion.empresaId }, deps.config.jwtSecreto, deps.config.jwtDuracionHoras);
    return { token, usuario: r.usuario, empresa: r.empresa, permisos: PERMISOS[r.usuario.rol] };
  });

  app.get('/api/v1/auth/me', async (req) => {
    const p = obtenerPerfil(deps, req.sesion);
    return { ...p, permisos: PERMISOS[p.usuario.rol] };
  });

  app.post('/api/v1/auth/cambiar-clave', async (req, respuesta) => {
    const d = parsear(z.object({ actual: z.string().min(1).max(128), nueva: z.string().min(1).max(128) }), req.body);
    cambiarClave(deps, req.sesion, d);
    return respuesta.code(204).send();
  });

  // ------------------------------------------------------------ catálogos e inicio
  app.get('/api/v1/catalogos', async () => ({
    utilidades: UTILIDADES,
    cuotas: CUOTAS,
    periodos: PERIODOS.map((p) => p.id),
    tiposGasto: TIPOS_GASTO,
    formasPago: FORMAS_PAGO.map((f) => ({ id: f, etiqueta: ETIQUETA_FORMA[f] })),
    calificaciones: CALIFICACIONES,
    roles: ROLES,
    porDefecto: { utilidad: UTILIDAD_POR_DEFECTO, cuotas: CUOTAS_POR_DEFECTO, periodo: PERIODO_POR_DEFECTO },
  }));

  app.get('/api/v1/inicio', async (req) => {
    const perfil = obtenerPerfil(deps, req.sesion);
    let carteraActual: { id: number; nombre: string } | null = null;
    let dia = null;
    if (req.sesion.carteraId != null || carteraSolicitada(req) != null) {
      const carteraId = cartera(req);
      carteraActual = listarCarteras(deps, req.sesion).find((c) => c.id === carteraId) ?? null;
      dia = estadoDelDia(deps, carteraId);
    }
    return {
      ...perfil,
      permisos: PERMISOS[perfil.usuario.rol],
      cartera: carteraActual,
      dia,
      fecha: hoy(deps),
      indicadores: { tasa: 1 + UTILIDAD_POR_DEFECTO / 100, utilidadPorDefecto: UTILIDAD_POR_DEFECTO, cuotasPorDefecto: CUOTAS_POR_DEFECTO },
    };
  });

  // ------------------------------------------------------------ carteras y usuarios
  app.get('/api/v1/carteras', async (req) => listarCarteras(deps, req.sesion));
  app.post('/api/v1/carteras', async (req, respuesta) => {
    const d = parsear(z.object({ nombre: texto(60) }), req.body);
    return respuesta.code(201).send(crearCartera(deps, req.sesion, d));
  });
  app.patch('/api/v1/carteras/:id', async (req) => {
    const { id: cid } = parsear(z.object({ id }), req.params);
    const d = parsear(z.object({ nombre: texto(60).optional(), activa: z.boolean().optional() }), req.body);
    return actualizarCartera(deps, req.sesion, cid, d);
  });

  app.get('/api/v1/usuarios', async (req) => listarUsuarios(deps, req.sesion));
  app.post('/api/v1/usuarios', async (req, respuesta) => {
    const d = parsear(
      z.object({ usuario: texto(30), nombre: texto(80), rol: z.enum(ROLES), carteraId: id.nullable().optional(), clave: z.string().min(1).max(128) }),
      req.body,
    );
    return respuesta.code(201).send(crearUsuario(deps, req.sesion, d));
  });
  app.patch('/api/v1/usuarios/:id', async (req) => {
    const { id: uid } = parsear(z.object({ id }), req.params);
    const d = parsear(
      z.object({ nombre: texto(80).optional(), rol: z.enum(ROLES).optional(), carteraId: id.nullable().optional(), activo: z.boolean().optional(), clave: z.string().min(1).max(128).optional() }),
      req.body,
    );
    return actualizarUsuario(deps, req.sesion, uid, d);
  });

  // ------------------------------------------------------------ clientes
  app.get('/api/v1/clientes', async (req) => {
    const q = parsear(z.object({ estado: z.enum(['todos', 'activos', 'inactivos']).optional(), q: z.string().max(60).optional() }), req.query);
    return listarClientes(deps, req.sesion, cartera(req), { estado: q.estado, busqueda: q.q });
  });
  app.post('/api/v1/clientes', async (req, respuesta) => {
    const d = parsear(esquemaCliente.extend({ credito: esquemaVenta }), req.body);
    const { credito, ...cliente } = d;
    return respuesta.code(201).send(crearCliente(deps, req.sesion, cartera(req), cliente, credito));
  });
  app.put('/api/v1/clientes/orden', async (req, respuesta) => {
    const d = parsear(z.object({ modo: z.enum(['ALFABETICO', 'PERSONALIZADO']), orden: z.array(id).max(5000).optional() }), req.body);
    enrutar(deps, req.sesion, cartera(req), d);
    return respuesta.code(204).send();
  });
  app.get('/api/v1/clientes/:id', async (req) => obtenerCliente(deps, req.sesion, parsear(z.object({ id }), req.params).id));
  app.patch('/api/v1/clientes/:id', async (req) => {
    const { id: cid } = parsear(z.object({ id }), req.params);
    const d = parsear(esquemaCliente.partial().extend({ calificacion: z.enum(CALIFICACIONES).optional() }), req.body);
    return actualizarCliente(deps, req.sesion, cid, d);
  });
  app.post('/api/v1/clientes/:id/referencias', async (req, respuesta) => {
    const { id: cid } = parsear(z.object({ id }), req.params);
    const d = parsear(z.object({ nombres: texto(60), direccion: texto(120), barrio: texto(60), telefono: texto(20), detalle: z.string().max(100).optional() }), req.body);
    return respuesta.code(201).send(crearReferencia(deps, req.sesion, cid, d));
  });
  app.post('/api/v1/clientes/:id/creditos', async (req, respuesta) => {
    const { id: cid } = parsear(z.object({ id }), req.params);
    return respuesta.code(201).send(vender(deps, req.sesion, cid, parsear(esquemaVenta, req.body)));
  });

  // ------------------------------------------------------------ créditos y pagos
  app.get('/api/v1/creditos', async (req) => {
    const q = parsear(z.object({ q: z.string().max(60).optional() }), req.query);
    return listarVigentes(deps, req.sesion, cartera(req), q.q);
  });
  app.get('/api/v1/creditos/:id', async (req) => informeCredito(deps, req.sesion, parsear(z.object({ id }), req.params).id));
  app.patch('/api/v1/creditos/:id', async (req) => {
    const { id: kid } = parsear(z.object({ id }), req.params);
    return editarCredito(deps, req.sesion, kid, parsear(esquemaVenta, req.body));
  });
  app.delete('/api/v1/creditos/:id', async (req, respuesta) => {
    anularCredito(deps, req.sesion, parsear(z.object({ id }), req.params).id);
    return respuesta.code(204).send();
  });
  app.post('/api/v1/creditos/:id/pagos', async (req, respuesta) => {
    const { id: kid } = parsear(z.object({ id }), req.params);
    const d = parsear(z.object({ valor: entero.positive(), forma: z.enum(FORMAS_PAGO), nota: z.string().max(200).optional() }), req.body);
    return respuesta.code(201).send(registrarPago(deps, req.sesion, kid, d));
  });
  app.patch('/api/v1/pagos/:id', async (req) => {
    const { id: pid } = parsear(z.object({ id }), req.params);
    return editarPago(deps, req.sesion, pid, parsear(z.object({ valor: entero.positive().optional(), forma: z.enum(FORMAS_PAGO).optional() }), req.body));
  });
  app.delete('/api/v1/pagos/:id', async (req) => anularPago(deps, req.sesion, parsear(z.object({ id }), req.params).id));

  // ------------------------------------------------------------ gastos
  const esquemaGasto = z.object({ tipo: z.enum(TIPOS_GASTO), valor: entero.positive(), detalle: z.string().max(100).optional() });
  app.get('/api/v1/gastos', async (req) => {
    const q = parsear(z.object({ desde: fecha.optional(), hasta: fecha.optional() }), req.query);
    const hoyFecha = hoy(deps);
    return consultarGastos(deps, req.sesion, cartera(req), q.desde ?? hoyFecha, q.hasta ?? q.desde ?? hoyFecha);
  });
  app.post('/api/v1/gastos', async (req, respuesta) => respuesta.code(201).send(registrarGasto(deps, req.sesion, cartera(req), parsear(esquemaGasto, req.body))));
  app.patch('/api/v1/gastos/:id', async (req, respuesta) => {
    editarGasto(deps, req.sesion, parsear(z.object({ id }), req.params).id, parsear(esquemaGasto, req.body));
    return respuesta.code(204).send();
  });
  app.delete('/api/v1/gastos/:id', async (req, respuesta) => {
    anularGasto(deps, req.sesion, parsear(z.object({ id }), req.params).id);
    return respuesta.code(204).send();
  });

  // ------------------------------------------------------------ base y día
  app.get('/api/v1/base', async (req) => consultarBase(deps, req.sesion, cartera(req)));
  app.post('/api/v1/base/movimientos', async (req, respuesta) => {
    const d = parsear(z.object({ tipo: z.enum(['ADICION', 'RETIRO']), valor: entero.positive(), detalle: z.string().max(100).optional() }), req.body);
    return respuesta.code(201).send(ajustarBase(deps, req.sesion, cartera(req), d));
  });
  app.get('/api/v1/dia', async (req) => estadoDelDia(deps, cartera(req)));
  app.post('/api/v1/dia/abrir', async (req) => abrirDia(deps, req.sesion, cartera(req)));
  app.post('/api/v1/dia/cerrar', async (req) => cerrarDia(deps, req.sesion, cartera(req)));

  // ------------------------------------------------------------ reportes
  app.get('/api/v1/reportes/transacciones', async (req) => {
    const q = parsear(z.object({ fecha: fecha.optional() }), req.query);
    return transacciones(deps, req.sesion, cartera(req), q.fecha ?? hoy(deps));
  });
  app.get('/api/v1/reportes/cierre', async (req) => {
    const q = parsear(z.object({ fecha: fecha.optional() }), req.query);
    return cierre(deps, req.sesion, cartera(req), q.fecha ?? hoy(deps));
  });
  app.get('/api/v1/notas', async (req) => {
    const q = parsear(z.object({ desde: fecha.optional(), hasta: fecha.optional() }), req.query);
    return historialNotas(deps, req.sesion, cartera(req), q.desde, q.hasta);
  });
  app.post('/api/v1/simulador', async (req) => simular(deps, req.sesion, parsear(esquemaVenta, req.body)));
}
