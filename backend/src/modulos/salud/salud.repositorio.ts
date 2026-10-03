import type { Consultor } from '../../db/pool.js';

/**
 * Lee una tabla de la aplicación en vez de hacer un simple `SELECT 1`, por dos motivos: confirma que
 * las migraciones están aplicadas, y el ping del monitor cuenta como uso real de la base, que es lo
 * que Supabase mira antes de pausar un proyecto (D13).
 */
export async function comprobarBase(db: Consultor): Promise<void> {
  await db.query('SELECT 1 FROM empresas LIMIT 1');
}
