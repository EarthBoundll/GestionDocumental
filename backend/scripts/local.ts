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
import { crearCorreo } from '../src/correo/crear.js';
import { aplicarMigraciones } from '../src/db/migraciones.js';
import { crearPool } from '../src/db/pool.js';
import { crearMaster, leerDatosDelMaster } from '../src/modulos/auth/master.js';
import { crearDeposito } from '../src/respaldos/deposito.js';

// No es el 5432, por si hay un PostgreSQL instalado, ni el 3000, que en esta máquina usa el suyo.
// Las pruebas de punta a punta (frontend/e2e) cambian carpeta y puerto: su base es otra, desechable.
const PUERTO_BASE = Number(process.env.PUERTO_BASE_LOCAL ?? 5433);
const DIRECTORIO = resolve(process.env.DIRECTORIO_LOCAL ?? '.local');
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
  // Si el .env apunta a Supabase, su certificado no vale para esta base local.
  DATABASE_CA: '',
  JWT_SECRETO: (await readFile(archivoSecreto, 'utf8')).trim(),
  ALMACENAMIENTO: 'disco',
  DIRECTORIO_ARCHIVOS: join(DIRECTORIO, 'archivos'),
  // Los correos de recuperación quedan en una carpeta, y su enlace sale por la consola.
  CORREO: 'archivo',
  DIRECTORIO_CORREOS: join(DIRECTORIO, 'correos'),
  DIRECTORIO_RESPALDOS: join(DIRECTORIO, 'respaldos'),
});
const pool = crearPool(entorno);
const aplicadas = await aplicarMigraciones(pool, resolve('migraciones'));
if (aplicadas.length > 0) console.log(`Migraciones aplicadas: ${aplicadas.join(', ')}`);

// El Master, si el .env trae sus datos (CLAUDE.md v2). Sin ellos, el sistema arranca igual.
if (process.env.MASTER_EMAIL && process.env.MASTER_PASSWORD) {
  try {
    const resultado = await crearMaster(pool, leerDatosDelMaster(process.env));
    if (resultado.creado) console.log('Cuenta del Master creada con los datos del .env.');
  } catch (error) {
    // Unos datos inválidos no impiden arrancar: se avisa, y el Master se crea cuando se corrijan.
    console.error(error instanceof Error ? error.message : error);
  }
} else {
  console.log('Sin MASTER_EMAIL y MASTER_PASSWORD en el .env: no se crea la cuenta del Master (ver .env.example).');
}

const servidor = crearApp({
  pool, entorno, almacenamiento: crearAlmacenamiento(entorno), correo: crearCorreo(entorno), respaldos: crearDeposito(entorno),
}).listen(entorno.PORT, () => {
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
