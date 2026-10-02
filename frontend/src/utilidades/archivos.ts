import { documentos } from '../api/recursos';

export const EXTENSIONES = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'];
export const PESO_MAXIMO = 10 * 1024 * 1024;

/** La comprobación rápida antes de enviar: la que vale es la del servidor, que también mira el contenido. */
export function problemaConArchivo(archivo: File): string | null {
  const extension = archivo.name.split('.').pop()?.toLowerCase() ?? '';
  if (!EXTENSIONES.includes(extension)) return `Solo se admiten archivos ${EXTENSIONES.join(', ').toUpperCase()}`;
  if (archivo.size > PESO_MAXIMO) return 'El archivo supera los 10 MB';
  return null;
}

/**
 * Abre o descarga un documento con el enlace firmado que entrega la API. Safari bloquea `window.open`
 * si se llama después de esperar una respuesta: la pestaña se abre vacía en el mismo clic y recibe el
 * enlace cuando llega (docs/04-api.md §5).
 */
export async function abrirArchivo(id: string, modo: 'ver' | 'descargar'): Promise<void> {
  if (modo === 'descargar') {
    const { url } = await documentos.enlace(id, 'descargar');
    // El servidor lo marca como adjunto: el navegador lo descarga sin salir de la aplicación.
    window.location.assign(url);
    return;
  }
  const pestana = window.open('', '_blank');
  try {
    const { url } = await documentos.enlace(id, 'ver');
    if (pestana) pestana.location.href = url;
    else window.location.assign(url);
  } catch (error) {
    pestana?.close();
    throw error;
  }
}
