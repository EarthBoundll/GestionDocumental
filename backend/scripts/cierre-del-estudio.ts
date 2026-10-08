/*
 * El cierre del estudio (D33, docs/09 §10). Usa el .env de backend/, con la conexión dueña de la base
 * (DATABASE_URL de gestion_api) y el almacenamiento de producción, igual que «npm run respaldo».
 *
 *   npm run cierre-del-estudio -- <empresaId>
 *       simulacro: cuenta lo que se borraría, tabla por tabla. No toca nada.
 *   npm run cierre-del-estudio -- <empresaId> --confirmar "<nombre exacto>" [--con-respaldos]
 *       borra la carpeta de la empresa en el almacenamiento y todas sus filas, y deja la constancia.
 *       Con --con-respaldos guarda un respaldo nuevo y borra los anteriores, que aún tienen los datos.
 *
 * La empresa tiene que estar desactivada desde la plataforma. El resultado se imprime en JSON, sin datos
 * personales: es el acta del cierre.
 */
import { parseArgs } from 'node:util';
import type pg from 'pg';
import { crearAlmacenamiento } from '../src/almacenamiento/crear.js';
import { eliminarDatosDeEmpresa, inventariarEmpresa, reemplazarRespaldos } from '../src/cierre/cierre-del-estudio.js';
import { leerEntorno } from '../src/config/entorno.js';
import { crearPool } from '../src/db/pool.js';
import { crearDeposito } from '../src/respaldos/deposito.js';

const { positionals: [empresaId], values } = parseArgs({
  allowPositionals: true,
  options: { confirmar: { type: 'string' }, 'con-respaldos': { type: 'boolean', default: false } },
});
const entorno = leerEntorno();
let pool: pg.Pool | undefined;

try {
  if (!empresaId) throw new Error('Uso: npm run cierre-del-estudio -- <empresaId> [--confirmar "<nombre exacto>"] [--con-respaldos]');
  pool = crearPool(entorno);
  if (values.confirmar === undefined) {
    const { empresa, filas } = await inventariarEmpresa(pool, empresaId);
    console.log(`Simulacro para «${empresa.nombre}» (${empresa.activa ? 'ACTIVA: desactívala antes de borrar' : 'desactivada'}).`);
    console.table(filas);
    console.log('No se borró nada. Para borrar, repite con --confirmar "<nombre exacto de la empresa>".');
  } else {
    const resultado = await eliminarDatosDeEmpresa(pool, crearAlmacenamiento(entorno), empresaId, { confirmacion: values.confirmar });
    const respaldos = values['con-respaldos'] ? await reemplazarRespaldos(pool, crearDeposito(entorno)) : null;
    console.log(JSON.stringify({ empresaId, cerradoEn: new Date().toISOString(), ...resultado, respaldos }, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
