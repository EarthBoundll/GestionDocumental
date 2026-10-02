import pg from 'pg';
import type { Entorno } from '../config/entorno.js';

/** Lo que necesita un repositorio: el pool, o el cliente de una transacción en curso. */
export type Consultor = pg.Pool | pg.PoolClient;

// Por defecto, pg convierte una columna `date` en la medianoche de la zona horaria del servidor, y en
// Lima (UTC-5) un documento del 15 de septiembre saldría del 14. La fecha de un documento no tiene
// hora ni zona (M10): se entrega tal cual, como texto AAAA-MM-DD.
pg.types.setTypeParser(pg.types.builtins.DATE, (valor) => valor);

export function crearPool(entorno: Pick<Entorno, 'DATABASE_URL' | 'DATABASE_CA'>): pg.Pool {
  const pool = new pg.Pool({
    connectionString: entorno.DATABASE_URL,
    // Con el certificado de Supabase, pg cifra y además verifica que el servidor es quien dice ser.
    ssl: entorno.DATABASE_CA ? { ca: entorno.DATABASE_CA } : undefined,
    application_name: 'gestion-documental-api',
    // La instancia gratuita de Render tiene 512 MB, y Supavisor limita las conexiones por proyecto.
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 10_000,
  });
  // Si una conexión inactiva se cae, el pool emite 'error'. Sin quien lo escuche, Node cierra el proceso.
  pool.on('error', (error) => console.error('[pg] se perdió una conexión inactiva:', error.message));
  return pool;
}
