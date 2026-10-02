import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    postgres: { puerto: number; usuario: string; clave: string };
  }
}

/**
 * Arranca un PostgreSQL 17 de verdad —la versión mayor de Supabase— una sola vez por ejecución de
 * pruebas, en un directorio temporal y en un puerto libre. Cada archivo de pruebas crea después su
 * propia base dentro de él. Al terminar, el servidor se detiene y el directorio se borra.
 */
export default async function arrancarPostgres(proyecto: TestProject) {
  const credenciales = { usuario: 'postgres', clave: 'postgres' };
  const puerto = await buscarPuertoLibre();
  const servidor = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), 'gestion-documental-pg-')),
    port: puerto,
    user: credenciales.usuario,
    password: credenciales.clave,
    persistent: false,
    // UTF-8 con el proveedor de localización propio de PostgreSQL: lower() convierte bien «Á» en
    // «á», como en Supabase, sin depender de las localizaciones instaladas en cada sistema operativo.
    initdbFlags: ['--encoding=UTF8', '--locale=C', '--locale-provider=builtin', '--builtin-locale=C.UTF-8'],
    onLog: () => {},
  });
  await servidor.initialise();
  await servidor.start();
  proyecto.provide('postgres', { puerto, ...credenciales });

  return async () => {
    await servidor.stop();
  };
}

function buscarPuertoLibre(): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const sonda = createServer();
    sonda.once('error', rechazar);
    sonda.listen(0, '127.0.0.1', () => {
      const direccion = sonda.address();
      sonda.close(() => (typeof direccion === 'object' && direccion ? resolver(direccion.port) : rechazar(new Error('Sin puerto'))));
    });
  });
}
