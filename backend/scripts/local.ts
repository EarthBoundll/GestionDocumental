/**
 * El backend completo en esta máquina, sin cuentas ni instalaciones: un PostgreSQL 17 propio (el mismo
 * de las pruebas), con los datos en backend/.local, las migraciones aplicadas, archivos en disco y la
 * API escuchando. Es para desarrollar y para enseñar el sistema; no es producción.
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { crearAlmacenamiento } from '../src/almacenamiento/crear.js';
import { crearApp } from '../src/app.js';
import { leerEntorno } from '../src/config/entorno.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';
import { crearPool } from '../src/db/pool.js';

// No es el 5432, por si hay un PostgreSQL instalado, ni el 3000, que en esta máquina usa el suyo.
const PUERTO_BASE = 5433;
const DIRECTORIO = resolve('.local');
const DATOS = join(DIRECTORIO, 'postgres');

await mkdir(DIRECTORIO, { recursive: true });
// Un secreto propio de esta máquina, que se conserva entre arranques para no cerrar las sesiones.
const archivoSecreto = join(DIRECTORIO, 'secreto');
if (!existsSync(archivoSecreto)) await writeFile(archivoSecreto, randomBytes(32).toString('base64url'));

const postgres = new EmbeddedPostgres({
  databaseDir: DATOS,
  port: PUERTO_BASE,
  user: 'postgres',
  password: 'postgres',
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C', '--locale-provider=builtin', '--builtin-locale=C.UTF-8'],
  onLog: () => {},
});
if (!existsSync(join(DATOS, 'PG_VERSION'))) await postgres.initialise();
await postgres.start();

const entorno = leerEntorno({
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: `postgresql://postgres:postgres@localhost:${PUERTO_BASE}/postgres`,
  JWT_SECRETO: (await readFile(archivoSecreto, 'utf8')).trim(),
  ALMACENAMIENTO: 'disco',
  DIRECTORIO_ARCHIVOS: join(DIRECTORIO, 'archivos'),
});
const pool = crearPool(entorno);
const aplicadas = await aplicarMigraciones(pool, resolve('migraciones'));
if (aplicadas.length > 0) console.log(`Migraciones aplicadas: ${aplicadas.join(', ')}`);

const servidor = crearApp({ pool, entorno, almacenamiento: crearAlmacenamiento(entorno) }).listen(entorno.PORT, () => {
  console.log(`API local en http://localhost:${entorno.PORT}/api/v1 (PostgreSQL en el puerto ${PUERTO_BASE}, datos en ${DIRECTORIO})`);
});

async function detener() {
  servidor.close();
  await pool.end();
  await postgres.stop();
  process.exit(0);
}
process.once('SIGINT', () => void detener());
process.once('SIGTERM', () => void detener());
