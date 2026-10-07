// Exporta la matriz de permisos como contrato para la app: app/test/fixtures/permisos.json
//   npm run exportar-permisos
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PERMISOS } from '../permissions.ts';

export const RUTA_CONTRATO = fileURLToPath(new URL('../../../app/test/fixtures/permisos.json', import.meta.url));

export function contratoPermisos(): string {
  return `${JSON.stringify(PERMISOS, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(RUTA_CONTRATO, contratoPermisos());
  console.log(`Contrato de permisos escrito en ${RUTA_CONTRATO}`);
}
