import type { TestProject } from 'vitest/node';
import { arrancarPostgresDesechable } from '../../scripts/postgres-desechable.js';

declare module 'vitest' {
  export interface ProvidedContext {
    postgres: { puerto: number; usuario: string; clave: string };
  }
}

/**
 * Arranca un PostgreSQL desechable una sola vez por ejecución de pruebas. Cada archivo de pruebas crea
 * después su propia base dentro de él. Al terminar, el servidor se detiene y su directorio se borra.
 */
export default async function arrancarPostgres(proyecto: TestProject) {
  const { puerto, usuario, clave, detener } = await arrancarPostgresDesechable();
  proyecto.provide('postgres', { puerto, usuario, clave });
  return detener;
}
