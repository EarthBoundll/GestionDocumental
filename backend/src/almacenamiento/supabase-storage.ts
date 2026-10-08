import { StorageClient } from '@supabase/storage-js';
import { exigirCarpetaDeEmpresa, type Almacenamiento } from './almacenamiento.js';

/** Supabase Storage, bucket privado (D9). Solo el backend conoce la clave secreta. */
export class AlmacenamientoSupabase implements Almacenamiento {
  readonly #bucket;

  constructor({ url, claveSecreta, bucket, fetch }: { url: string; claveSecreta: string; bucket: string; fetch?: typeof globalThis.fetch }) {
    const cliente = new StorageClient(
      `${url.replace(/\/$/, '')}/storage/v1`,
      { apikey: claveSecreta, Authorization: `Bearer ${claveSecreta}` },
      fetch,
    );
    this.#bucket = cliente.from(bucket);
  }

  async subir(ruta: string, contenido: Buffer, tipoMime: string): Promise<void> {
    const { error } = await this.#bucket.upload(ruta, contenido, { contentType: tipoMime, upsert: false });
    if (error) throw new Error(`Supabase no aceptó el archivo ${ruta}`, { cause: error });
  }

  async firmarEnlace(ruta: string, { segundos, descargarComo }: Parameters<Almacenamiento['firmarEnlace']>[1]) {
    const { data, error } = await this.#bucket.createSignedUrl(ruta, segundos, { download: descargarComo ?? false });
    if (error) throw new Error(`Supabase no firmó el enlace de ${ruta}`, { cause: error });
    return data.signedUrl;
  }

  async eliminar(ruta: string): Promise<void> {
    const { error } = await this.#bucket.remove([ruta]);
    if (error) throw new Error(`Supabase no eliminó ${ruta}`, { cause: error });
  }

  async copiar(origen: string, destino: string): Promise<void> {
    const { error } = await this.#bucket.copy(origen, destino);
    if (error) throw new Error(`Supabase no copió ${origen} en ${destino}`, { cause: error });
  }

  async vaciarCarpeta(empresaId: string): Promise<number> {
    exigirCarpetaDeEmpresa(empresaId);
    let borrados = 0;
    // Storage lista de a 100: se borra lo listado y se vuelve a pedir hasta que no quede nada.
    for (;;) {
      const { data, error } = await this.#bucket.list(empresaId, { limit: 100 });
      if (error) throw new Error(`Supabase no listó la carpeta ${empresaId}`, { cause: error });
      if (data.length === 0) return borrados;
      const { error: alBorrar } = await this.#bucket.remove(data.map((archivo) => `${empresaId}/${archivo.name}`));
      if (alBorrar) throw new Error(`Supabase no vació la carpeta ${empresaId}`, { cause: alBorrar });
      borrados += data.length;
    }
  }
}
