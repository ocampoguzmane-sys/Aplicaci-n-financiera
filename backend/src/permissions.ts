// Fuente única de verdad de los permisos por rol. Ver docs/roles.md.
// Para cambiar lo que puede hacer un rol, se agrega o se quita el permiso en su lista.

export const ROLES = ['administrador', 'supervisor', 'empleado'] as const;
export type Rol = (typeof ROLES)[number];

export type Permiso =
  | 'clientes.ver'
  | 'clientes.crear'
  | 'clientes.editar'
  | 'clientes.referencias.crear'
  | 'clientes.enrutar'
  | 'creditos.ver'
  | 'creditos.vender'
  | 'creditos.editar'
  | 'pagos.ver'
  | 'pagos.crear'
  | 'pagos.editar'
  | 'gastos.ver'
  | 'gastos.crear'
  | 'gastos.editar'
  | 'reportes.ver'
  | 'notas.ver'
  | 'simulador.usar'
  | 'base.ver'
  | 'base.ajustar'
  | 'dia.gestionar'
  | 'usuarios.gestionar'
  | 'carteras.gestionar'
  | 'carteras.ver_todas';

const LECTURA: readonly Permiso[] = [
  'clientes.ver',
  'creditos.ver',
  'pagos.ver',
  'gastos.ver',
  'reportes.ver',
  'notas.ver',
  'simulador.usar',
  'base.ver',
];

export const PERMISOS: Readonly<Record<Rol, readonly Permiso[]>> = {
  // Acceso total, con edición de todo.
  administrador: [
    ...LECTURA,
    'clientes.crear',
    'clientes.editar',
    'clientes.referencias.crear',
    'clientes.enrutar',
    'creditos.vender',
    'creditos.editar',
    'pagos.crear',
    'pagos.editar',
    'gastos.crear',
    'gastos.editar',
    'base.ajustar',
    'dia.gestionar',
    'usuarios.gestionar',
    'carteras.gestionar',
    'carteras.ver_todas',
  ],
  // Ve la información de clientes; solo edita pagos; abre y cierra el día.
  supervisor: [...LECTURA, 'pagos.crear', 'pagos.editar', 'dia.gestionar', 'carteras.ver_todas'],
  // Crea clientes, ve la información, y adiciona gastos y pagos.
  empleado: [...LECTURA, 'clientes.crear', 'clientes.referencias.crear', 'pagos.crear', 'gastos.crear'],
};

export function puede(rol: Rol, permiso: Permiso): boolean {
  return PERMISOS[rol].includes(permiso);
}
