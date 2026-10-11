import type pg from 'pg';
import type { Almacenamiento } from '../almacenamiento/almacenamiento.js';
import { leerContenido, type Lectura } from '../compartido/contenido/leer.js';
import { accesoDeEmpresa, accesoDePlataforma, type Identidad } from '../db/acceso.js';
import { contenidoParaGuardar, guardarSiSiguePendiente, pendientesDeLeer, type Pendiente } from '../modulos/documentos/contenido.js';

/**
 * La lectura ve todos los documentos de la empresa, también los de categorías restringidas: actúa con la
 * visibilidad de un administrador, sin ser ninguna persona, por el mismo acceso a datos que la API (D17).
 */
const IDENTIDAD_DE_LA_LECTURA: Identidad = { usuarioId: null, rol: 'administrador' };

/** Cuántos documentos lee como mucho por empresa en cada pasada: con 0,1 CPU, unos segundos; el resto, en la siguiente. */
const MAXIMO_POR_EMPRESA = 20;

/** Trae el archivo y lo lee. Si no se puede traer, queda «ilegible» y no se reintenta para siempre. */
async function leer(almacenamiento: Almacenamiento, pendiente: Pendiente): Promise<Lectura> {
  try {
    return await leerContenido(await almacenamiento.descargar(pendiente.archivoRuta), pendiente.tipoMime);
  } catch (error) {
    console.error(`[contenido] no se pudo traer ${pendiente.archivoRuta}:`, error);
    return { estado: 'ilegible', texto: null, motivo: 'no se pudo traer el archivo' };
  }
}

/**
 * Lee el contenido de lo que quedó pendiente (D45): lo subido antes de la migración 015 y una versión restaurada
 * cuyo archivo no se pudo traer. Descargar y leer van fuera de toda transacción; cada documento se guarda en la
 * suya, solo si sigue pendiente y con el mismo archivo. Devuelve cuántos leyó.
 */
export async function leerPendientes(pool: pg.Pool, almacenamiento: Almacenamiento): Promise<number> {
  const empresas = await accesoDePlataforma(pool).ejecutar(async (db) =>
    (await db.query<{ id: string }>('SELECT id FROM empresas ORDER BY creado_en')).rows);
  let leidos = 0;
  for (const { id: empresaId } of empresas) {
    const acceso = accesoDeEmpresa(pool, empresaId, IDENTIDAD_DE_LA_LECTURA);
    try {
      const pendientes = await acceso.ejecutar((db) => pendientesDeLeer(db, empresaId, MAXIMO_POR_EMPRESA));
      for (const pendiente of pendientes) {
        const lectura = await leer(almacenamiento, pendiente);
        const guardado = await acceso.ejecutar(async (db) =>
          guardarSiSiguePendiente(db, empresaId, pendiente, await contenidoParaGuardar(db, empresaId, lectura)));
        if (guardado) leidos++;
      }
    } catch (error) {
      // Una empresa que falla no detiene a las demás; lo pendiente se intenta en la próxima pasada.
      console.error(`[contenido] no se pudo leer en la empresa ${empresaId}:`, error);
    }
  }
  return leidos;
}

/** Cada cuánto se busca lo pendiente: tras la migración hay que leer lo existente; después, casi nunca hay nada. */
const CADA_MS = 10 * 60 * 1000;

/** Programa la lectura en este proceso: dos minutos después de arrancar y después cada diez. */
export function programarLectura(pool: pg.Pool, almacenamiento: Almacenamiento): () => void {
  const pasar = () => {
    leerPendientes(pool, almacenamiento)
      .then((leidos) => { if (leidos > 0) console.log(`[contenido] ${leidos} documento(s) leído(s)`); })
      .catch((error: unknown) => console.error('[contenido] la lectura falló:', error));
  };
  const primera = setTimeout(pasar, 120_000);
  const siguientes = setInterval(pasar, CADA_MS);
  primera.unref();
  siguientes.unref();
  return () => {
    clearTimeout(primera);
    clearInterval(siguientes);
  };
}
