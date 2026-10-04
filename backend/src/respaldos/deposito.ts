import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StorageClient } from '@supabase/storage-js';
import type { Entorno } from '../config/entorno.js';

export interface RespaldoGuardado {
  nombre: string;
  bytes: number;
  creadoEn: string;
}

/** Dónde se guardan los respaldos: un bucket privado propio en producción y una carpeta en desarrollo. */
export interface DepositoDeRespaldos {
  guardar(nombre: string, contenido: Buffer): Promise<void>;
  /** Los respaldos guardados, del más reciente al más antiguo. */
  listar(): Promise<RespaldoGuardado[]>;
  leer(nombre: string): Promise<Buffer>;
  eliminar(nombres: string[]): Promise<void>;
}

/** respaldo-2026-10-04T08-00-00Z.json.gz: el nombre ordena por fecha y no deja salir de la carpeta. */
export const NOMBRE_DE_RESPALDO = /^respaldo-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json\.gz$/;

function exigirNombre(nombre: string): void {
  if (!NOMBRE_DE_RESPALDO.test(nombre)) throw new Error(`«${nombre}» no es el nombre de un respaldo`);
}

export class DepositoEnDisco implements DepositoDeRespaldos {
  readonly #directorio: string;

  constructor(directorio: string) {
    this.#directorio = resolve(directorio);
  }

  async guardar(nombre: string, contenido: Buffer): Promise<void> {
    exigirNombre(nombre);
    await mkdir(this.#directorio, { recursive: true });
    await writeFile(join(this.#directorio, nombre), contenido, { flag: 'wx' });
  }

  async listar(): Promise<RespaldoGuardado[]> {
    const nombres = await readdir(this.#directorio).catch(() => [] as string[]);
    const respaldos = await Promise.all(nombres.filter((nombre) => NOMBRE_DE_RESPALDO.test(nombre)).map(async (nombre) => {
      const datos = await stat(join(this.#directorio, nombre));
      return { nombre, bytes: datos.size, creadoEn: datos.mtime.toISOString() };
    }));
    return respaldos.sort((a, b) => b.nombre.localeCompare(a.nombre));
  }

  async leer(nombre: string): Promise<Buffer> {
    exigirNombre(nombre);
    return readFile(join(this.#directorio, nombre));
  }

  async eliminar(nombres: string[]): Promise<void> {
    for (const nombre of nombres) {
      exigirNombre(nombre);
      await rm(join(this.#directorio, nombre), { force: true });
    }
  }
}

export class DepositoSupabase implements DepositoDeRespaldos {
  readonly #bucket;

  constructor({ url, claveSecreta, bucket }: { url: string; claveSecreta: string; bucket: string }) {
    const cliente = new StorageClient(`${url.replace(/\/$/, '')}/storage/v1`, { apikey: claveSecreta, Authorization: `Bearer ${claveSecreta}` });
    this.#bucket = cliente.from(bucket);
  }

  async guardar(nombre: string, contenido: Buffer): Promise<void> {
    exigirNombre(nombre);
    const { error } = await this.#bucket.upload(nombre, contenido, { contentType: 'application/gzip', upsert: false });
    if (error) throw new Error(`Supabase no aceptó el respaldo ${nombre}`, { cause: error });
  }

  async listar(): Promise<RespaldoGuardado[]> {
    const { data, error } = await this.#bucket.list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
    if (error) throw new Error('Supabase no listó los respaldos', { cause: error });
    return data
      .filter((objeto) => NOMBRE_DE_RESPALDO.test(objeto.name))
      .map((objeto) => ({
        nombre: objeto.name,
        bytes: Number((objeto.metadata as { size?: number } | null)?.size ?? 0),
        creadoEn: objeto.created_at ?? '',
      }));
  }

  async leer(nombre: string): Promise<Buffer> {
    exigirNombre(nombre);
    const { data, error } = await this.#bucket.download(nombre);
    if (error) throw new Error(`Supabase no entregó el respaldo ${nombre}`, { cause: error });
    return Buffer.from(await data.arrayBuffer());
  }

  async eliminar(nombres: string[]): Promise<void> {
    nombres.forEach(exigirNombre);
    if (nombres.length === 0) return;
    const { error } = await this.#bucket.remove(nombres);
    if (error) throw new Error('Supabase no eliminó los respaldos antiguos', { cause: error });
  }
}

export function crearDeposito(entorno: Entorno): DepositoDeRespaldos {
  if (entorno.ALMACENAMIENTO === 'supabase') {
    return new DepositoSupabase({ url: entorno.SUPABASE_URL!, claveSecreta: entorno.SUPABASE_CLAVE_SECRETA!, bucket: entorno.RESPALDOS_BUCKET });
  }
  return new DepositoEnDisco(entorno.DIRECTORIO_RESPALDOS);
}
