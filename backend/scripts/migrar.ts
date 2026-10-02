import { resolve } from 'node:path';
import type pg from 'pg';
import { leerEntorno } from '../src/config/entorno.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';
import { crearPool } from '../src/db/pool.js';

let pool: pg.Pool | undefined;
try {
  pool = crearPool(leerEntorno());
  // npm ejecuta los scripts desde backend/, así que la ruta es relativa a esa carpeta.
  const aplicadas = await aplicarMigraciones(pool, resolve('migraciones'));
  console.log(aplicadas.length > 0 ? `Migraciones aplicadas: ${aplicadas.join(', ')}` : 'La base ya estaba al día');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
