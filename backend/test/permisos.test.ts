import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PERMISOS, puede, ROLES, type Permiso, type Rol } from '../src/permissions.ts';

const TODOS: Permiso[] = [...new Set(Object.values(PERMISOS).flat())];

function permitidos(rol: Rol): Permiso[] {
  return TODOS.filter((p) => puede(rol, p));
}

describe('matriz de roles (docs/roles.md)', () => {
  it('el administrador tiene todos los permisos', () => {
    assert.deepEqual(permitidos('administrador').sort(), [...TODOS].sort());
  });

  it('solo el administrador crea usuarios, administra carteras y ajusta la base', () => {
    for (const permiso of ['usuarios.gestionar', 'carteras.gestionar', 'base.ajustar'] as const) {
      assert.deepEqual(
        ROLES.filter((r) => puede(r, permiso)),
        ['administrador'],
        permiso,
      );
    }
  });

  it('el administrador y el supervisor abren y cierran el día; el empleado no', () => {
    assert.equal(puede('administrador', 'dia.gestionar'), true);
    assert.equal(puede('supervisor', 'dia.gestionar'), true);
    assert.equal(puede('empleado', 'dia.gestionar'), false);
  });

  it('el supervisor solo escribe sobre pagos y el día; todo lo demás es lectura', () => {
    const escrituras = permitidos('supervisor').filter((p) => !/\.(ver|usar|ver_todas)$/.test(p));
    assert.deepEqual(escrituras.sort(), ['dia.gestionar', 'pagos.crear', 'pagos.editar']);
  });

  it('el empleado crea clientes, registra pagos y gastos, y no edita nada ya registrado', () => {
    const escrituras = permitidos('empleado').filter((p) => !/\.(ver|usar|ver_todas)$/.test(p));
    assert.deepEqual(escrituras.sort(), ['clientes.crear', 'clientes.referencias.crear', 'gastos.crear', 'pagos.crear']);
    assert.equal(puede('empleado', 'pagos.editar'), false);
    assert.equal(puede('empleado', 'gastos.editar'), false);
    assert.equal(puede('empleado', 'clientes.editar'), false);
  });

  it('todos los roles pueden consultar la información', () => {
    for (const rol of ROLES) {
      for (const permiso of ['clientes.ver', 'creditos.ver', 'pagos.ver', 'reportes.ver', 'simulador.usar'] as const) {
        assert.equal(puede(rol, permiso), true, `${rol} · ${permiso}`);
      }
    }
  });

  it('solo el empleado queda limitado a su propia cartera', () => {
    assert.equal(puede('empleado', 'carteras.ver_todas'), false);
    assert.equal(puede('supervisor', 'carteras.ver_todas'), true);
    assert.equal(puede('administrador', 'carteras.ver_todas'), true);
  });
});
