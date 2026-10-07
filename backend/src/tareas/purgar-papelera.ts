import type pg from 'pg';
import type { Almacenamiento } from '../almacenamiento/almacenamiento.js';
import { accesoDeEmpresa, accesoDePlataforma, type Identidad } from '../db/acceso.js';
import { DIAS_EN_PAPELERA, rutasAPurgar } from '../modulos/documentos/documentos.servicio.js';
import { bloquearVencidos, marcarPurgado } from '../modulos/documentos/documentos.repositorio.js';
import { autorDelSistemaEn, registrarAccion } from '../modulos/historial/historial.registro.js';

/**
 * La purga ve la papelera entera de cada empresa, también lo de categorías restringidas: actúa con la
 * visibilidad de un administrador, sin ser ninguna persona. Entra por el mismo acceso a datos que la API
 * (D17), empresa por empresa, así que tampoco ella puede tocar filas de otra.
 */
const IDENTIDAD_DE_LA_PURGA: Identidad = { usuarioId: null, rol: 'administrador' };

/** Cuántos documentos purga como mucho por empresa en cada pasada: el resto queda para la siguiente. */
const MAXIMO_POR_EMPRESA = 200;

/**
 * Purga lo que lleva más de `dias` en la papelera (RF26). Cada documento va en su propia transacción:
 * el archivo se borra antes de marcar la fila, así que un fallo a medias se repara en la siguiente
 * pasada. Devuelve cuántos purgó.
 */
export async function purgarVencidos(
  pool: pg.Pool,
  almacenamiento: Almacenamiento,
  { dias = DIAS_EN_PAPELERA }: { dias?: number } = {},
): Promise<number> {
  const empresas = await accesoDePlataforma(pool).ejecutar(async (db) =>
    (await db.query<{ id: string }>('SELECT id FROM empresas ORDER BY creado_en')).rows);
  let purgados = 0;
  for (const { id: empresaId } of empresas) {
    const acceso = accesoDeEmpresa(pool, empresaId, IDENTIDAD_DE_LA_PURGA);
    try {
      for (let vez = 0; vez < MAXIMO_POR_EMPRESA; vez++) {
        const purgado = await acceso.ejecutar(async (db) => {
          const [documento] = await bloquearVencidos(db, empresaId, { dias, limite: 1 });
          if (!documento) return false;
          for (const ruta of await rutasAPurgar(db, empresaId, documento)) await almacenamiento.eliminar(ruta);
          await marcarPurgado(db, empresaId, documento.id);
          await registrarAccion(db, {
            accion: 'DOCUMENTO_PURGADO',
            autor: autorDelSistemaEn(empresaId),
            contexto: null,
            entidad: { tipo: 'documento', id: documento.id },
            detalle: { nombre: documento.nombre, motivo: 'PLAZO_VENCIDO', dias },
          });
          return true;
        });
        if (!purgado) break;
        purgados++;
      }
    } catch (error) {
      // Una empresa que falla no detiene la purga de las demás; lo pendiente se intenta en la próxima.
      console.error(`[papelera] no se pudo purgar en la empresa ${empresaId}:`, error);
    }
  }
  return purgados;
}

/** Cada cuánto se purga. Es una tarea barata, y basta con que nada pase mucho más de 30 días. */
const CADA_MS = 6 * 60 * 60 * 1000;

/**
 * Programa la purga en este proceso: un minuto después de arrancar y después cada seis horas. Con una
 * sola instancia en Render basta; si hubiera varias, SKIP LOCKED evita que dos purguen lo mismo.
 */
export function programarPurga(pool: pg.Pool, almacenamiento: Almacenamiento): () => void {
  const pasar = () => {
    purgarVencidos(pool, almacenamiento)
      .then((purgados) => { if (purgados > 0) console.log(`[papelera] ${purgados} documento(s) purgado(s)`); })
      .catch((error: unknown) => console.error('[papelera] la purga falló:', error));
  };
  const primera = setTimeout(pasar, 60_000);
  const siguientes = setInterval(pasar, CADA_MS);
  primera.unref();
  siguientes.unref();
  return () => {
    clearTimeout(primera);
    clearInterval(siguientes);
  };
}
