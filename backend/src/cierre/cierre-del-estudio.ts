import type pg from 'pg';
import type { Almacenamiento } from '../almacenamiento/almacenamiento.js';
import { conTransaccion } from '../db/transaccion.js';
import { registrarAccion, SIN_AUTOR } from '../modulos/historial/historial.registro.js';
import type { DepositoDeRespaldos } from '../respaldos/deposito.js';
import { respaldar } from '../respaldos/respaldo.js';

/*
 * El cierre del estudio (D33, docs/09 §10): el día fijado con el asesor, el investigador elimina de la
 * plataforma los datos de la empresa evaluada, como promete el consentimiento (Ley 29733). No es una
 * función de la aplicación —el historial es inalterable para ella (RN17)— sino un procedimiento del dueño
 * de la base, con su conexión: el único que puede apagar, dentro de una transacción, el trigger que
 * protege el historial.
 */

const SU_GENTE = 'SELECT id FROM usuarios WHERE empresa_id = $1';

/**
 * Qué se borra, en el orden que piden las claves foráneas. Del historial sale lo de la empresa y, por si
 * acaso, lo que sin ser de ninguna nombra a su gente: un intento con uno de sus correos antes de que
 * existiera la cuenta.
 */
const TABLAS: readonly (readonly [string, string])[] = [
  ['notificaciones', 'empresa_id = $1'],
  ['solicitudes', 'empresa_id = $1'],
  ['documento_versiones', 'empresa_id = $1'],
  ['documentos', 'empresa_id = $1'],
  ['categoria_accesos', 'empresa_id = $1'],
  ['categorias', 'empresa_id = $1'],
  ['tiempos_respuesta', 'empresa_id = $1'],
  ['historial', `empresa_id = $1 OR usuario_id IN (${SU_GENTE})
     OR (empresa_id IS NULL AND lower(detalle ->> 'email') IN (SELECT lower(email) FROM usuarios WHERE empresa_id = $1))`],
  ['sesiones', `usuario_id IN (${SU_GENTE})`],
  ['recuperaciones_clave', `usuario_id IN (${SU_GENTE})`],
  ['usuarios', 'empresa_id = $1'],
  ['empresas', 'id = $1'],
];

export interface InventarioDeEmpresa {
  empresa: { id: string; nombre: string; activa: boolean };
  filas: Record<string, number>;
}

/** El simulacro: qué se borraría, tabla por tabla, sin tocar nada. */
export async function inventariarEmpresa(pool: pg.Pool, empresaId: string): Promise<InventarioDeEmpresa> {
  const { rows: [empresa] } = await pool.query<InventarioDeEmpresa['empresa']>(
    'SELECT id, nombre, activa FROM empresas WHERE id = $1', [empresaId]);
  if (!empresa) throw new Error(`No existe una empresa con el id ${empresaId}`);
  const filas: Record<string, number> = {};
  for (const [tabla, condicion] of TABLAS) {
    const { rows: [conteo] } = await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM ${tabla} WHERE ${condicion}`, [empresaId]);
    filas[tabla] = conteo?.total ?? 0;
  }
  return { empresa, filas };
}

export interface ResultadoDelCierre {
  filas: Record<string, number>;
  archivos: number;
}

/**
 * Borra todo lo de la empresa: primero su carpeta del almacenamiento, después sus filas en una sola
 * transacción, y deja una constancia sin datos personales en el historial de la plataforma (sin empresa,
 * para que la vea la auditoría del Master). Exige que la empresa esté desactivada y su nombre exacto como
 * confirmación. Si se corta a la mitad, se vuelve a ejecutar: vaciar una carpeta vacía no falla, y la base
 * se borra entera o no se borra.
 */
export async function eliminarDatosDeEmpresa(
  pool: pg.Pool,
  almacenamiento: Almacenamiento,
  empresaId: string,
  { confirmacion }: { confirmacion: string },
): Promise<ResultadoDelCierre> {
  const { empresa } = await inventariarEmpresa(pool, empresaId);
  if (empresa.activa) {
    throw new Error(`«${empresa.nombre}» sigue activa: desactívala desde la plataforma antes de borrar sus datos`);
  }
  if (confirmacion !== empresa.nombre) {
    throw new Error(`Para confirmar, escribe el nombre exacto de la empresa: «${empresa.nombre}»`);
  }

  const archivos = await almacenamiento.vaciarCarpeta(empresaId);
  const filas = await conTransaccion(pool, async (db) => {
    // Solo dentro de esta transacción: si algo falla, el trigger vuelve a estar como estaba.
    await db.query('ALTER TABLE historial DISABLE TRIGGER historial_sin_modificaciones');
    const borradas: Record<string, number> = {};
    for (const [tabla, condicion] of TABLAS) {
      borradas[tabla] = (await db.query(`DELETE FROM ${tabla} WHERE ${condicion}`, [empresaId])).rowCount ?? 0;
    }
    await db.query('ALTER TABLE historial ENABLE TRIGGER historial_sin_modificaciones');
    await registrarAccion(db, {
      accion: 'EMPRESA_ELIMINADA',
      autor: SIN_AUTOR,
      contexto: null,
      entidad: { tipo: 'empresa', id: empresaId },
      detalle: { motivo: 'cierre del estudio', filasBorradas: borradas, archivosBorrados: archivos },
    });
    return borradas;
  });
  return { filas, archivos };
}

/**
 * Los respaldos anteriores al cierre todavía tienen los datos borrados. Se guarda uno nuevo, ya sin ellos,
 * y se borran todos los demás: la plataforma no se queda sin respaldo ni un solo momento.
 */
export async function reemplazarRespaldos(
  pool: pg.Pool,
  deposito: DepositoDeRespaldos,
): Promise<{ nuevo: string; eliminados: string[] }> {
  const { nombre: nuevo } = await respaldar(pool, deposito, { autor: SIN_AUTOR, contexto: null });
  const eliminados = (await deposito.listar()).map((respaldo) => respaldo.nombre).filter((nombre) => nombre !== nuevo);
  await deposito.eliminar(eliminados);
  return { nuevo, eliminados };
}
