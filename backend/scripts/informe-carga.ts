/**
 * Ejecuta la prueba de carga con 50.000 documentos y deja su informe en docs/evidencias: la evidencia de
 * escalabilidad del indicador 7 (RNF05). Como la de aislamiento, usa el PostgreSQL de las pruebas.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const destino = resolve('..', 'docs', 'evidencias', 'prueba-de-carga.md');
const { status } = spawnSync('npx vitest run tests/carga/carga.test.ts', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, INFORME_CARGA: destino },
});
if (status === 0) console.log(`\nInforme escrito en ${destino}`);
process.exitCode = status ?? 1;
