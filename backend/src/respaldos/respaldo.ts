import { gunzipSync, gzipSync } from 'node:zlib';
import type pg from 'pg';
import { conTransaccion } from '../db/transaccion.js';
import { registrarAccion, type Autor } from '../modulos/historial/historial.registro.js';
import type { Contexto } from '../compartido/peticion.js';
import type { DepositoDeRespaldos } from './deposito.js';

/*
 * Respaldos lógicos de la base (RF29, D25). Leen y escriben con la conexión dueña de las tablas, por
 * encima de la RLS: un respaldo es de toda la plataforma, y una copia filtrada no serviría para
 * restaurar. Es otra excepción explícita al aislamiento, como la capa de identidad, y por eso el
 * respaldo nunca se entrega a nadie por la API: el Master puede pedirlo y ver que existe, no descargarlo.
 */

/**
 * Las tablas que se respaldan, en un orden que respeta las claves foráneas. Las sesiones y las
 * recuperaciones de contraseña no: tras restaurar, cada persona vuelve a iniciar sesión, y un enlace
 * de recuperación no debe revivir.
 */
export const TABLAS = [
  { nombre: 'empresas', orden: 'id' },
  { nombre: 'usuarios', orden: 'id' },
  { nombre: 'categorias', orden: 'id' },
  { nombre: 'categoria_accesos', orden: 'categoria_id, usuario_id' },
  { nombre: 'documentos', orden: 'id' },
  { nombre: 'documento_versiones', orden: 'id' },
  { nombre: 'solicitudes', orden: 'id' },
  { nombre: 'notificaciones', orden: 'id' },
  { nombre: 'historial', orden: 'id' },
  { nombre: 'tiempos_respuesta', orden: 'id' },
] as const;

const VERSION = 1;
/** Cuántos días se guardan los respaldos. Los más antiguos se borran al guardar uno nuevo. */
export const DIAS_DE_RETENCION = 30;

interface ContenidoDeRespaldo {
  version: number;
  generadoEn: string;
  /** Las migraciones de la base respaldada: solo se restaura en una base con las mismas. */
  migraciones: string[];
  tablas: Record<string, unknown[]>;
}

async function migracionesDe(db: pg.Pool | pg.PoolClient): Promise<string[]> {
  const { rows } = await db.query<{ archivo: string }>('SELECT archivo FROM esquema_migraciones ORDER BY archivo');
  return rows.map((fila) => fila.archivo);
}

/** Lee todas las tablas en una sola transacción de solo lectura: el respaldo es una foto coherente. */
export async function generarRespaldo(pool: pg.Pool): Promise<{ contenido: Buffer; filas: Record<string, number> }> {
  const datos = await conTransaccion(pool, async (cliente) => {
    await cliente.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const tablas: Record<string, unknown[]> = {};
    for (const { nombre, orden } of TABLAS) {
      // row_to_json escribe cada valor como lo escribe PostgreSQL (fechas con su zona, jsonb tal cual),
      // y json_populate_recordset lo lee igual al restaurar: no pasa por los tipos de JavaScript.
      const { rows } = await cliente.query<{ filas: unknown[] }>(
        `SELECT coalesce(json_agg(t ORDER BY ${orden}), '[]'::json) AS filas FROM ${nombre} t`);
      tablas[nombre] = rows[0]!.filas;
    }
    return { version: VERSION, generadoEn: new Date().toISOString(), migraciones: await migracionesDe(cliente), tablas };
  });
  const filas = Object.fromEntries(Object.entries(datos.tablas).map(([tabla, lista]) => [tabla, lista.length]));
  return { contenido: gzipSync(JSON.stringify(datos satisfies ContenidoDeRespaldo)), filas };
}

/**
 * Vuelca un respaldo en una base vacía con las mismas migraciones, todo o nada. Se niega si la base ya
 * tiene datos: restaurar no mezcla, sustituye una base perdida.
 */
export async function restaurarRespaldo(pool: pg.Pool, comprimido: Buffer): Promise<Record<string, number>> {
  const datos = JSON.parse(gunzipSync(comprimido).toString('utf8')) as ContenidoDeRespaldo;
  if (datos.version !== VERSION) throw new Error(`Este respaldo es de la versión ${datos.version}; se esperaba la ${VERSION}`);
  return conTransaccion(pool, async (cliente) => {
    const migraciones = await migracionesDe(cliente);
    if (migraciones.join() !== datos.migraciones.join()) {
      throw new Error(`La base tiene las migraciones [${migraciones.join(', ')}] y el respaldo [${datos.migraciones.join(', ')}]: `
        + 'restaura en una base migrada con la misma versión del código');
    }
    for (const { nombre } of TABLAS) {
      const { rows } = await cliente.query<{ hay: boolean }>(`SELECT exists (SELECT 1 FROM ${nombre}) AS hay`);
      if (rows[0]!.hay) throw new Error(`La tabla ${nombre} ya tiene datos: restaura en una base recién migrada`);
    }
    const filas: Record<string, number> = {};
    for (const { nombre } of TABLAS) {
      const lista = datos.tablas[nombre] ?? [];
      // OVERRIDING SYSTEM VALUE: el historial conserva sus números, que son su orden.
      const { rowCount } = await cliente.query(
        `INSERT INTO ${nombre} OVERRIDING SYSTEM VALUE SELECT * FROM json_populate_recordset(null::${nombre}, $1::json)`,
        [JSON.stringify(lista)],
      );
      filas[nombre] = rowCount ?? 0;
    }
    // El siguiente asiento del historial continúa después del último restaurado.
    await cliente.query(
      "SELECT setval(pg_get_serial_sequence('historial', 'id'), coalesce(max(id), 1), max(id) IS NOT NULL) FROM historial");
    return filas;
  });
}

/** respaldo-2026-10-04T08-00-00Z.json.gz */
export const nombreDeRespaldo = (fecha: Date) => `respaldo-${fecha.toISOString().slice(0, 19).replaceAll(':', '-')}Z.json.gz`;

/**
 * Genera un respaldo, lo guarda, lo deja en el historial de la plataforma y borra los que pasan del
 * plazo de retención. Lo usan la tarea nocturna (sin autor) y el Master cuando pide uno.
 */
export async function respaldar(
  pool: pg.Pool,
  deposito: DepositoDeRespaldos,
  { autor, contexto, registrar = (asiento) => registrarAccion(pool, asiento) }: {
    autor: Autor;
    contexto: Contexto | null;
    /** Cómo se registra: el Master lo hace con su propio acceso, la tarea nocturna con el pool. */
    registrar?: (asiento: Parameters<typeof registrarAccion>[1]) => Promise<void>;
  },
): Promise<{ nombre: string; bytes: number; filas: Record<string, number> }> {
  const { contenido, filas } = await generarRespaldo(pool);
  const nombre = nombreDeRespaldo(new Date());
  await deposito.guardar(nombre, contenido);
  await registrar({ accion: 'RESPALDO_GENERADO', autor, contexto, detalle: { archivo: nombre, bytes: contenido.length, filas } });
  await aplicarRetencion(deposito).catch((error: unknown) => console.error('[respaldos] no se pudieron borrar los antiguos:', error));
  return { nombre, bytes: contenido.length, filas };
}

/** Borra los respaldos de más de DIAS_DE_RETENCION días, por la fecha de su nombre. */
export async function aplicarRetencion(deposito: DepositoDeRespaldos, ahora = new Date()): Promise<string[]> {
  const limite = nombreDeRespaldo(new Date(ahora.getTime() - DIAS_DE_RETENCION * 86_400_000));
  const antiguos = (await deposito.listar()).map((respaldo) => respaldo.nombre).filter((nombre) => nombre < limite);
  await deposito.eliminar(antiguos);
  return antiguos;
}
