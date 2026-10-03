/**
 * Crea la cuenta del Administrador Master (CLAUDE.md v2). Lee MASTER_EMAIL, MASTER_PASSWORD,
 * MASTER_NOMBRE y MASTER_DNI del entorno —el .env, que no se sube a git— y la base de DATABASE_URL.
 * Se ejecuta una vez; si el Master ya existe, no hace nada.
 */
import type pg from 'pg';
import { z } from '../src/compartido/validacion.js';
import { crearPool } from '../src/db/pool.js';
import { crearMaster, leerDatosDelMaster } from '../src/modulos/auth/master.js';

let pool: pg.Pool | undefined;
try {
  const datos = leerDatosDelMaster(process.env);
  const conexion = z.object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DATABASE_CA: z.string().optional().transform((valor) => valor || undefined),
  }).parse(process.env);
  pool = crearPool(conexion);
  const resultado = await crearMaster(pool, datos);
  // Nunca se imprime el correo ni la contraseña: la consola también queda en registros.
  console.log(resultado.creado ? 'Cuenta del Master creada.' : resultado.motivo);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
