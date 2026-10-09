/**
 * La imagen de fondo se prepara en el navegador antes de subirla (D39): se reduce a 1920 px y se comprime en
 * WebP, o en JPG si el navegador no sabe escribir WebP. Así una foto de 5 MB del celular llega en unos
 * cientos de KB, y la API solo tiene que comprobar el formato y el peso.
 */

/** Un poco por debajo de los 512 KB que admite la API (identidad.imagenes.ts), para no rozarlos. */
const PESO_OBJETIVO = 480 * 1024;
/** Una pantalla Full HD: más no se ve, y pesa. */
const LADO_MAXIMO = 1920;
/** Con menos, estirada a lo ancho de una computadora, se ve borrosa. */
export const LADO_MINIMO = 1000;
/** Lo que se acepta elegir; lo que se sube es siempre más pequeño. */
export const PESO_MAXIMO_ORIGINAL = 15 * 1024 * 1024;
export const TIPOS_DE_FONDO = ['image/jpeg', 'image/png', 'image/webp'];

const comoBlob = (lienzo: HTMLCanvasElement, tipo: string, calidad: number) =>
  new Promise<Blob | null>((listo) => lienzo.toBlob(listo, tipo, calidad));

/** Por qué no sirve la imagen elegida, antes de leerla; o null si se puede intentar. */
export function problemaDeFondo(archivo: File): string | null {
  if (!TIPOS_DE_FONDO.includes(archivo.type)) return 'El fondo debe ser una imagen JPG, PNG o WebP';
  if (archivo.size > PESO_MAXIMO_ORIGINAL) return 'La imagen supera los 15 MB';
  return null;
}

export async function prepararFondo(archivo: File): Promise<File> {
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con otra, en JPG o PNG');
  }
  const { width: ancho, height: alto } = imagen;
  if (Math.max(ancho, alto) < LADO_MINIMO) {
    imagen.close();
    throw new Error(`La imagen es pequeña (${ancho} × ${alto} px) y se vería borrosa. Usa una de al menos ${LADO_MINIMO} px de ancho`);
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(ancho, alto));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  const contexto = lienzo.getContext('2d');
  if (!contexto) throw new Error('Este navegador no puede preparar la imagen');
  // Sobre blanco: un PNG con transparencia pasado a JPG no queda con manchas negras.
  contexto.fillStyle = '#fff';
  contexto.fillRect(0, 0, lienzo.width, lienzo.height);
  contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();

  const nombre = archivo.name.replace(/\.[^.]*$/, '') || 'fondo';
  for (const calidad of [0.82, 0.7, 0.55]) {
    // Un navegador que no escribe WebP devuelve un PNG: entonces, JPG.
    let blob = await comoBlob(lienzo, 'image/webp', calidad);
    if (blob?.type !== 'image/webp') blob = await comoBlob(lienzo, 'image/jpeg', calidad);
    if (blob && blob.size <= PESO_OBJETIVO) {
      return new File([blob], `${nombre}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type });
    }
  }
  throw new Error('La imagen tiene demasiado detalle para un fondo. Prueba con otra más sencilla');
}
