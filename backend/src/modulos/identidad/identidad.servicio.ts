import { randomUUID } from 'node:crypto';
import type { Almacenamiento } from '../../almacenamiento/almacenamiento.js';
import { calcularCambios, valoresNuevos } from '../../compartido/cambios.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import type { Actor } from '../../compartido/peticion.js';
import { identificarTipo } from '../../compartido/tipos-de-archivo.js';
import { registrarAccion, type Autor } from '../historial/historial.registro.js';
import type { CambiosIdentidad } from './identidad.esquemas.js';
import { actualizarIdentidad, leerIdentidad, type FilaIdentidad } from './identidad.repositorio.js';

/**
 * El logo se descarga en cada inicio de sesión (su enlace firmado cambia y el navegador no lo guarda),
 * también desde el celular: por eso es pequeño.
 */
export const PESO_MAXIMO_LOGO_BYTES = 256 * 1024;
/** Solo imágenes de mapa de bits: un SVG puede llevar scripts. */
const EXTENSIONES_DE_LOGO = ['png', 'jpg', 'jpeg'];

/** La identidad que ve quien usa el sistema: con el enlace del logo ya firmado. */
export interface Marca {
  nombreComercial: string | null;
  colorPrimario: string | null;
  logoUrl: string | null;
}

export interface ArchivoDeLogo {
  nombreOriginal: string;
  contenido: Buffer;
}

const logoNoAdmitido = () => new ErrorAplicacion(415, 'TIPO_NO_PERMITIDO', 'El logo debe ser una imagen PNG o JPG');

/** Lo que dice ser y lo que es, como con los documentos (RN09), pero solo PNG y JPG. */
function tipoDeLogo({ nombreOriginal, contenido }: ArchivoDeLogo) {
  const extension = /\.([a-z0-9]+)$/i.exec(nombreOriginal)?.[1]?.toLowerCase() ?? '';
  if (!EXTENSIONES_DE_LOGO.includes(extension)) throw logoNoAdmitido();
  if (contenido.length > PESO_MAXIMO_LOGO_BYTES) {
    throw new ErrorAplicacion(413, 'ARCHIVO_DEMASIADO_GRANDE', 'El logo supera los 256 KB');
  }
  try {
    return identificarTipo(nombreOriginal, contenido);
  } catch {
    throw logoNoAdmitido();
  }
}

export type ServicioIdentidad = ReturnType<typeof crearServicioIdentidad>;

/**
 * RF31: el nombre comercial, el color y el logo de una empresa. Lo usan dos puertas con el mismo código:
 * el administrador sobre la suya y el Master sobre cualquiera. Cada una llega con su acceso (D17) y su
 * autor; la base decide además que, del lado de la empresa, solo un administrador puede cambiarla (008).
 */
export function crearServicioIdentidad({ almacenamiento, vigenciaSegundos }: { almacenamiento: Almacenamiento; vigenciaSegundos: number }) {
  async function marcaDe({ nombreComercial, colorPrimario, logoRuta }: FilaIdentidad): Promise<Marca> {
    const logoUrl = logoRuta
      ? await almacenamiento.firmarEnlace(logoRuta, { segundos: vigenciaSegundos, tipoMime: logoRuta.endsWith('.png') ? 'image/png' : 'image/jpeg' })
      : null;
    return { nombreComercial, colorPrimario, logoUrl };
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
      const cambios = calcularCambios({ nombreComercial: actual.nombreComercial, colorPrimario: actual.colorPrimario }, propuesta);
      if (Object.keys(cambios).length > 0) await guardar(actor, empresaId, autor, valoresNuevos(cambios), { cambios });
      return marcaDe({ ...actual, ...valoresNuevos(cambios) });
    },

    /**
     * El archivo sube antes que la fila, como un documento: si lo de después falla, se borra el nuevo; si
     * todo sale bien, se borra el anterior. Cada logo tiene un nombre nuevo, así que nunca se pisa.
     */
    async cambiarLogo(actor: Actor, empresaId: string, autor: Autor, archivo: ArchivoDeLogo): Promise<Marca> {
      const tipo = tipoDeLogo(archivo);
      const actual = await identidadExistente(actor, empresaId);
      const ruta = `${empresaId}/${randomUUID()}.${tipo.mime === 'image/png' ? 'png' : 'jpg'}`;
      await almacenamiento.subir(ruta, archivo.contenido, tipo.mime);
      try {
        await guardar(actor, empresaId, autor, { logoRuta: ruta }, {
          cambios: { logo: { antes: actual.logoRuta !== null, despues: true } }, archivo: archivo.nombreOriginal,
        });
      } catch (error) {
        await almacenamiento.eliminar(ruta).catch(() => undefined);
        throw error;
      }
      if (actual.logoRuta) await borrarSinBloquear(almacenamiento, actual.logoRuta);
      return marcaDe({ ...actual, logoRuta: ruta });
    },

    async quitarLogo(actor: Actor, empresaId: string, autor: Autor): Promise<Marca> {
      const actual = await identidadExistente(actor, empresaId);
      if (!actual.logoRuta) return marcaDe(actual);
      await guardar(actor, empresaId, autor, { logoRuta: null }, { cambios: { logo: { antes: true, despues: false } } });
      await borrarSinBloquear(almacenamiento, actual.logoRuta);
      return marcaDe({ ...actual, logoRuta: null });
    },
  };
}

/** Un logo viejo que no se pudo borrar solo ocupa espacio: no debe deshacer un cambio ya confirmado. */
async function borrarSinBloquear(almacenamiento: Almacenamiento, ruta: string): Promise<void> {
  await almacenamiento.eliminar(ruta).catch((error: unknown) => {
    console.error(`[identidad] quedó un logo huérfano en ${ruta}:`, error);
  });
}
