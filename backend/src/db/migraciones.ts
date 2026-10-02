import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { conTransaccion } from './transaccion.js';

const NOMBRE_VALIDO = /^(\d{3})_[a-z0-9_]+\.sql$/;

interface Migracion {
  nombre: string;
  sql: string;
  suma: string;
}

/**
 * Aplica en orden las migraciones de `directorio` que la base todavía no tiene, cada una en su
 * propia transacción, y devuelve los nombres de las aplicadas. Antes comprueba que las ya aplicadas
 * no hayan cambiado ni desaparecido: si algo no cuadra, se detiene sin tocar nada.
 */
export async function aplicarMigraciones(pool: pg.Pool, directorio: string): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS esquema_migraciones (
      archivo      varchar(100) PRIMARY KEY,
      suma_sha256  char(64) NOT NULL,
      aplicada_en  timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE esquema_migraciones ENABLE ROW LEVEL SECURITY;
  `);
  const migraciones = await leerMigraciones(directorio);
  const registradas = await leerRegistradas(pool);
  comprobarRegistradas(migraciones, registradas);

  const aplicadas: string[] = [];
  for (const { nombre, sql, suma } of migraciones) {
    if (registradas.has(nombre)) continue;
    await conTransaccion(pool, async (cliente) => {
      await cliente.query(sql);
      await cliente.query('INSERT INTO esquema_migraciones (archivo, suma_sha256) VALUES ($1, $2)', [nombre, suma]);
    });
    aplicadas.push(nombre);
  }
  return aplicadas;
}

async function leerMigraciones(directorio: string): Promise<Migracion[]> {
  const nombres = (await readdir(directorio)).filter((nombre) => nombre.endsWith('.sql')).sort();
  const prefijos = new Set<string>();
  for (const nombre of nombres) {
    const prefijo = NOMBRE_VALIDO.exec(nombre)?.[1];
    if (prefijo === undefined) throw new Error(`«${nombre}» no sigue el formato 000_descripcion.sql`);
    if (prefijos.has(prefijo)) throw new Error(`Hay dos migraciones con el número ${prefijo}`);
    prefijos.add(prefijo);
  }
  return Promise.all(
    nombres.map(async (nombre) => {
      // Git puede convertir los saltos de línea al clonar en Windows. Se normalizan para que la suma
      // sea la misma en la máquina de desarrollo y en Render, o las dos discutirían por el mismo archivo.
      const sql = (await readFile(join(directorio, nombre), 'utf8')).replace(/\r\n/g, '\n');
      return { nombre, sql, suma: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

async function leerRegistradas(pool: pg.Pool): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ archivo: string; suma_sha256: string }>(
    'SELECT archivo, suma_sha256 FROM esquema_migraciones',
  );
  return new Map(rows.map((fila) => [fila.archivo, fila.suma_sha256]));
}

function comprobarRegistradas(migraciones: Migracion[], registradas: Map<string, string>): void {
  const sumaPorNombre = new Map(migraciones.map((migracion) => [migracion.nombre, migracion.suma]));
  for (const [nombre, sumaRegistrada] of registradas) {
    const sumaActual = sumaPorNombre.get(nombre);
    if (sumaActual === undefined) {
      throw new Error(`${nombre} está aplicada en la base, pero su archivo ya no existe`);
    }
    if (sumaActual !== sumaRegistrada) {
      throw new Error(`${nombre} cambió después de aplicarse. Una migración aplicada no se edita: crea una nueva`);
    }
  }
}
