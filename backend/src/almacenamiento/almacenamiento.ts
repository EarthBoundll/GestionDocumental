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
  /**
   * Borra todo lo que hay en la carpeta de una empresa —documentos, versiones, logo y lo que hubiera
   * quedado huérfano— y dice cuántos archivos borró. Solo lo usa el cierre del estudio (D33).
   */
  vaciarCarpeta(empresaId: string): Promise<number>;
}

/** Una carpeta de empresa es su id: nada que no lo sea puede vaciarse, tampoco la raíz del bucket. */
export function exigirCarpetaDeEmpresa(carpeta: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(carpeta)) {
    throw new Error(`«${carpeta}» no es la carpeta de una empresa`);
  }
}
