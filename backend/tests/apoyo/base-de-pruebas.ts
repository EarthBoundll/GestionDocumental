import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { inject } from 'vitest';
import { aplicarMigraciones } from '../../src/db/migraciones.js';
import { crearPool } from '../../src/db/pool.js';

export const DIRECTORIO_MIGRACIONES = fileURLToPath(new URL('../../migraciones', import.meta.url));

export interface BaseDePruebas {
  pool: pg.Pool;
  url: string;
  cerrar(): Promise<void>;
}

/**
 * Crea una base vacía en el PostgreSQL de las pruebas (ver postgres-global.ts) y le aplica las
 * migraciones reales. El pool sale de crearPool(), con la misma configuración que en producción.
 */
export async function crearBaseDePruebas({ migrada = true } = {}): Promise<BaseDePruebas> {
  const { puerto, usuario, clave } = inject('postgres');
  const servidor = `postgresql://${usuario}:${clave}@127.0.0.1:${puerto}`;
  const nombre = `prueba_${randomUUID().replaceAll('-', '')}`;

  const administracion = new pg.Client({ connectionString: `${servidor}/postgres` });
  await administracion.connect();
  try {
    await administracion.query(`CREATE DATABASE ${nombre}`);
  } finally {
    await administracion.end();
  }

  const url = `${servidor}/${nombre}`;
  const pool = crearPool({ DATABASE_URL: url, DATABASE_CA: undefined });
  if (migrada) await aplicarMigraciones(pool, DIRECTORIO_MIGRACIONES);
  return { pool, url, cerrar: () => pool.end() };
}
