/**
 * Ejecuta la batería de aislamiento entre empresas y deja su informe en docs/evidencias: la evidencia
 * del indicador 6 para la tesis (CLAUDE.md v2). No necesita ninguna cuenta: usa el PostgreSQL de las pruebas.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const destino = resolve('..', 'docs', 'evidencias', 'aislamiento-entre-empresas.md');
const { status } = spawnSync('npx vitest run tests/integracion/aislamiento.test.ts', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, INFORME_AISLAMIENTO: destino },
});
if (status === 0) console.log(`\nInforme escrito en ${destino}`);
process.exitCode = status ?? 1;
