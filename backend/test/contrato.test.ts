import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { contratoPermisos, RUTA_CONTRATO } from '../src/cli/exportar-permisos.ts';

describe('contrato con la app', () => {
  it('app/test/fixtures/permisos.json coincide con la matriz de permisos del servidor', () => {
    assert.equal(
      readFileSync(RUTA_CONTRATO, 'utf8'),
      contratoPermisos(),
      'Los permisos cambiaron: ejecuta "npm run exportar-permisos" y revisa las pruebas de la app.',
    );
  });
});
