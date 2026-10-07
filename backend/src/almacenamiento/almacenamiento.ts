/**
 * Dónde viven los archivos. Es la única pieza detrás de una interfaz (E3), porque es la única con
 * alternativas reales: Supabase Storage en producción y el disco en desarrollo y en las pruebas.
 */
export interface Almacenamiento {
  subir(ruta: string, contenido: Buffer, tipoMime: string): Promise<void>;
  /**
   * Un enlace temporal al archivo. Con `descargarComo`, el navegador lo descarga con ese nombre;
   * sin él, lo muestra si sabe hacerlo (un PDF, una imagen).
   */
  firmarEnlace(ruta: string, opciones: { segundos: number; tipoMime: string; descargarComo?: string }): Promise<string>;
  eliminar(ruta: string): Promise<void>;
  /** Una copia del archivo en otra ruta, sin pasarlo por la API: así se restaura una versión (D30). */
  copiar(origen: string, destino: string): Promise<void>;
}
