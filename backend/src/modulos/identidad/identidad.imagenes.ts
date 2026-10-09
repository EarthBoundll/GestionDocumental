import { ErrorAplicacion } from '../../compartido/errores.js';

/** Solo imágenes de mapa de bits: un SVG puede llevar scripts. */
type Formato = 'png' | 'jpg' | 'webp';

const MIME: Record<Formato, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const POR_EXTENSION: Record<string, Formato> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' };

const tieneBytes = (contenido: Buffer, bytes: number[], desde = 0) => bytes.every((byte, i) => contenido[desde + i] === byte);

/** Lo que el archivo es por sus primeros bytes. Un WebP es un contenedor RIFF que dice «WEBP» en el byte 8. */
const ES: Record<Formato, (contenido: Buffer) => boolean> = {
  png: (contenido) => tieneBytes(contenido, [0x89, 0x50, 0x4e, 0x47]),
  jpg: (contenido) => tieneBytes(contenido, [0xff, 0xd8, 0xff]),
  webp: (contenido) => tieneBytes(contenido, [0x52, 0x49, 0x46, 0x46]) && tieneBytes(contenido, [0x57, 0x45, 0x42, 0x50], 8),
};

/** Las dos imágenes de una empresa: el logo del menú y el fondo de las pantallas (D28, D39). */
export const IMAGENES = {
  /**
   * Se descarga en cada inicio de sesión (su enlace firmado cambia y el navegador no lo guarda), también
   * desde el celular: por eso es pequeño.
   */
  logo: { columna: 'logoRuta', formatos: ['png', 'jpg'], pesoMaximo: 256 * 1024 },
  /** El navegador la reduce y la comprime antes de subirla; el celular ni la descarga (D39). */
  fondo: { columna: 'fondoRuta', formatos: ['webp', 'jpg'], pesoMaximo: 512 * 1024 },
} as const satisfies Record<string, { columna: string; formatos: readonly Formato[]; pesoMaximo: number }>;

export type Imagen = keyof typeof IMAGENES;

export interface ArchivoDeImagen {
  nombreOriginal: string;
  contenido: Buffer;
}

const nombres = (formatos: readonly Formato[]) => formatos.map((formato) => (formato === 'webp' ? 'WebP' : formato.toUpperCase())).join(' o ');

/** Lo que dice ser y lo que es, como con los documentos (RN09): la extensión y los primeros bytes coinciden. */
export function formatoDe(imagen: Imagen, { nombreOriginal, contenido }: ArchivoDeImagen): { extension: Formato; mime: string } {
  const { formatos, pesoMaximo } = IMAGENES[imagen];
  const extension = POR_EXTENSION[/\.([a-z0-9]+)$/i.exec(nombreOriginal)?.[1]?.toLowerCase() ?? ''];
  if (!extension || !(formatos as readonly Formato[]).includes(extension) || !ES[extension](contenido)) {
    throw new ErrorAplicacion(415, 'TIPO_NO_PERMITIDO', `El ${imagen} debe ser una imagen ${nombres(formatos)}`);
  }
  if (contenido.length > pesoMaximo) {
    throw new ErrorAplicacion(413, 'ARCHIVO_DEMASIADO_GRANDE', `El ${imagen} supera los ${pesoMaximo / 1024} KB`);
  }
  return { extension, mime: MIME[extension] };
}

/** El tipo con que se sirve una imagen ya guardada: su ruta termina en la extensión que se le dio al subirla. */
export function mimeDeRuta(ruta: string): string {
  return MIME[POR_EXTENSION[ruta.slice(ruta.lastIndexOf('.') + 1)] ?? 'jpg'];
}
