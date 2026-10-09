import { randomUUID } from 'node:crypto';
import type { Almacenamiento } from '../../almacenamiento/almacenamiento.js';
import { calcularCambios, valoresNuevos } from '../../compartido/cambios.js';
import { noEncontrado } from '../../compartido/errores.js';
import type { Actor } from '../../compartido/peticion.js';
import { registrarAccion, type Autor } from '../historial/historial.registro.js';
import type { CambiosIdentidad } from './identidad.esquemas.js';
import { formatoDe, IMAGENES, mimeDeRuta, type ArchivoDeImagen, type Imagen } from './identidad.imagenes.js';
import { actualizarIdentidad, leerIdentidad, type FilaIdentidad } from './identidad.repositorio.js';

/** La identidad que ve quien usa el sistema: con los enlaces de sus imágenes ya firmados. */
export interface Marca {
  nombreComercial: string | null;
  colorPrimario: string | null;
  colorFondo: string | null;
  logoUrl: string | null;
  fondoUrl: string | null;
}

export type ServicioIdentidad = ReturnType<typeof crearServicioIdentidad>;

/**
 * RF31: el nombre comercial, los colores, el logo y el fondo de una empresa. Lo usan dos puertas con el
 * mismo código: el administrador sobre la suya y el Master sobre cualquiera. Cada una llega con su acceso (D17) y su
 * autor; la base decide además que, del lado de la empresa, solo un administrador puede cambiarla (008).
 */
export function crearServicioIdentidad({ almacenamiento, vigenciaSegundos }: { almacenamiento: Almacenamiento; vigenciaSegundos: number }) {
  const firmar = (ruta: string | null) =>
    ruta ? almacenamiento.firmarEnlace(ruta, { segundos: vigenciaSegundos, tipoMime: mimeDeRuta(ruta) }) : null;

  async function marcaDe({ nombreComercial, colorPrimario, colorFondo, logoRuta, fondoRuta }: FilaIdentidad): Promise<Marca> {
    const [logoUrl, fondoUrl] = await Promise.all([firmar(logoRuta), firmar(fondoRuta)]);
    return { nombreComercial, colorPrimario, colorFondo, logoUrl, fondoUrl };
  }

  async function identidadExistente(actor: Actor, empresaId: string): Promise<FilaIdentidad> {
    const fila = await actor.datos.ejecutar((db) => leerIdentidad(db, empresaId));
    if (!fila) throw noEncontrado('La empresa no existe');
    return fila;
  }

  /** El cambio y su asiento, juntos (D7). EMPRESA_EDITADA con el antes y el después, como cualquier edición. */
  async function guardar(actor: Actor, empresaId: string, autor: Autor, valores: Partial<FilaIdentidad>, detalle: Record<string, unknown>) {
    await actor.datos.ejecutar(async (cliente) => {
      if (!(await actualizarIdentidad(cliente, empresaId, valores))) throw noEncontrado('La empresa no existe');
      await registrarAccion(cliente, {
        accion: 'EMPRESA_EDITADA', autor, contexto: actor.contexto, entidad: { tipo: 'empresa', id: empresaId }, detalle,
      });
    });
  }

  return {
    marcaDe,

    async obtener(actor: Actor, empresaId: string): Promise<Marca> {
      return marcaDe(await identidadExistente(actor, empresaId));
    },

    async editar(actor: Actor, empresaId: string, autor: Autor, propuesta: CambiosIdentidad): Promise<Marca> {
      const actual = await identidadExistente(actor, empresaId);
      const { nombreComercial, colorPrimario, colorFondo } = actual;
      const cambios = calcularCambios({ nombreComercial, colorPrimario, colorFondo }, propuesta);
      if (Object.keys(cambios).length > 0) await guardar(actor, empresaId, autor, valoresNuevos(cambios), { cambios });
      return marcaDe({ ...actual, ...valoresNuevos(cambios) });
    },

    /**
     * El logo o el fondo. El archivo sube antes que la fila, como un documento: si lo de después falla, se
     * borra el nuevo; si todo sale bien, se borra el anterior. Cada imagen tiene un nombre nuevo, así que
     * nunca se pisa.
     */
    async cambiarImagen(actor: Actor, empresaId: string, autor: Autor, imagen: Imagen, archivo: ArchivoDeImagen): Promise<Marca> {
      const { extension, mime } = formatoDe(imagen, archivo);
      const { columna } = IMAGENES[imagen];
      const actual = await identidadExistente(actor, empresaId);
      const anterior = actual[columna];
      const ruta = `${empresaId}/${randomUUID()}.${extension}`;
      await almacenamiento.subir(ruta, archivo.contenido, mime);
      try {
        await guardar(actor, empresaId, autor, { [columna]: ruta }, {
          cambios: { [imagen]: { antes: anterior !== null, despues: true } }, archivo: archivo.nombreOriginal,
        });
      } catch (error) {
        await almacenamiento.eliminar(ruta).catch(() => undefined);
        throw error;
      }
      if (anterior) await borrarSinBloquear(almacenamiento, anterior);
      return marcaDe({ ...actual, [columna]: ruta });
    },

    async quitarImagen(actor: Actor, empresaId: string, autor: Autor, imagen: Imagen): Promise<Marca> {
      const { columna } = IMAGENES[imagen];
      const actual = await identidadExistente(actor, empresaId);
      const anterior = actual[columna];
      if (!anterior) return marcaDe(actual);
      await guardar(actor, empresaId, autor, { [columna]: null }, { cambios: { [imagen]: { antes: true, despues: false } } });
      await borrarSinBloquear(almacenamiento, anterior);
      return marcaDe({ ...actual, [columna]: null });
    },
  };
}

/** Una imagen vieja que no se pudo borrar solo ocupa espacio: no debe deshacer un cambio ya confirmado. */
async function borrarSinBloquear(almacenamiento: Almacenamiento, ruta: string): Promise<void> {
  await almacenamiento.eliminar(ruta).catch((error: unknown) => {
    console.error(`[identidad] quedó una imagen huérfana en ${ruta}:`, error);
  });
}
