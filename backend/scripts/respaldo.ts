/*
 * Respaldos desde la consola (RF29, D25). Usa el .env de backend/, igual que «npm run migrar».
 *
 *   npm run respaldo -- generar              guarda un respaldo ahora en el depósito (bucket o carpeta)
 *   npm run respaldo -- listar               lista los respaldos guardados
 *   npm run respaldo -- descargar <nombre>   copia un respaldo del depósito a la carpeta actual
 *   npm run respaldo -- restaurar <nombre|ruta.json.gz>
 *       vuelca el respaldo en la base de DATABASE_URL, que debe estar recién migrada y vacía.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import type pg from 'pg';
import { leerEntorno } from '../src/config/entorno.js';
import { crearPool } from '../src/db/pool.js';
import { SIN_AUTOR } from '../src/modulos/historial/historial.registro.js';
import { crearDeposito } from '../src/respaldos/deposito.js';
import { respaldar, restaurarRespaldo } from '../src/respaldos/respaldo.js';

const [orden, argumento] = process.argv.slice(2);
const entorno = leerEntorno();
const deposito = crearDeposito(entorno);
let pool: pg.Pool | undefined;

try {
  switch (orden) {
    case 'generar': {
      pool = crearPool(entorno);
      const { nombre, bytes, filas } = await respaldar(pool, deposito, { autor: SIN_AUTOR, contexto: null });
      console.log(`Respaldo guardado: ${nombre} (${bytes} bytes)`, filas);
      break;
    }
    case 'listar':
      console.table(await deposito.listar());
      break;
    case 'descargar': {
      if (!argumento) throw new Error('Indica el nombre del respaldo');
      await writeFile(argumento, await deposito.leer(argumento), { flag: 'wx' });
      console.log(`Copiado en ./${argumento}`);
      break;
    }
    case 'restaurar': {
      if (!argumento) throw new Error('Indica el nombre del respaldo o la ruta de un archivo .json.gz');
      const contenido = existsSync(argumento) ? await readFile(argumento) : await deposito.leer(argumento);
      pool = crearPool(entorno);
      const filas = await restaurarRespaldo(pool, contenido);
      console.log('Restaurado. Filas por tabla:', filas);
      break;
    }
    default:
      throw new Error('Uso: npm run respaldo -- generar | listar | descargar <nombre> | restaurar <nombre|ruta>');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
