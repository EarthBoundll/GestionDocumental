import { fileURLToPath } from 'node:url';
import { aplicarMigraciones } from '../src/db/migraciones.js';
import { crearPool } from '../src/db/pool.js';
import { restaurarRespaldo } from '../src/respaldos/respaldo.js';
import { arrancarPostgresDesechable } from './postgres-desechable.js';

const MIGRACIONES = fileURLToPath(new URL('../migraciones', import.meta.url));

/**
 * Ensaya una restauración (D25) sin tocar ninguna base de verdad: vuelca el respaldo en un PostgreSQL
 * desechable, recién migrado con el código de esta copia, y lo borra al terminar. Si pasa, ese respaldo
 * se restauraría con esta versión del código; es lo que pide el congelamiento (docs/07 §9).
 */
export async function ensayarRestauracion(comprimido: Buffer): Promise<Record<string, number>> {
  const postgres = await arrancarPostgresDesechable();
  try {
    const pool = crearPool({
      DATABASE_URL: `postgresql://${postgres.usuario}:${postgres.clave}@127.0.0.1:${postgres.puerto}/postgres`,
      DATABASE_CA: undefined,
    });
    try {
      await aplicarMigraciones(pool, MIGRACIONES);
      return await restaurarRespaldo(pool, comprimido);
    } finally {
      await pool.end();
    }
  } finally {
    await postgres.detener();
  }
}
