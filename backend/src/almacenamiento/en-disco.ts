import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Router } from 'express';
import { ErrorAplicacion } from '../compartido/errores.js';
import type { Almacenamiento } from './almacenamiento.js';

const RUTA_VALIDA = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

/**
 * Almacenamiento en una carpeta local, para desarrollo y pruebas. Imita lo que hace Supabase: la API
 * firma un enlace que caduca, y otra ruta sirve el archivo solo si la firma y el plazo son válidos.
 */
export class AlmacenamientoEnDisco implements Almacenamiento {
  readonly #directorio: string;
  readonly #urlBase: string;
  readonly #clave: Buffer;

  constructor({ directorio, urlPublica, secreto }: { directorio: string; urlPublica: string; secreto: string }) {
    this.#directorio = resolve(directorio);
    this.#urlBase = `${urlPublica.replace(/\/$/, '')}/api/v1/archivos`;
    // Una clave propia, derivada del secreto: un enlace firmado nunca sirve como token de sesión ni al revés.
    this.#clave = createHmac('sha256', secreto).update('enlaces-de-archivos').digest();
  }

  async subir(ruta: string, contenido: Buffer): Promise<void> {
    const destino = this.#ubicar(ruta);
    await mkdir(dirname(destino), { recursive: true });
    await writeFile(destino, contenido, { flag: 'wx' });
  }

  async firmarEnlace(ruta: string, { segundos, tipoMime, descargarComo }: Parameters<Almacenamiento['firmarEnlace']>[1]) {
    const parametros = new URLSearchParams({
      expira: String(Math.floor(Date.now() / 1000) + segundos),
      tipo: tipoMime,
      ...(descargarComo && { nombre: descargarComo }),
    });
    parametros.set('firma', this.#firmar(ruta, parametros));
    return `${this.#urlBase}/${ruta}?${parametros}`;
  }

  async eliminar(ruta: string): Promise<void> {
    await rm(this.#ubicar(ruta), { force: true });
  }

  /** La ruta que sirve los archivos a quien trae un enlace firmado y vigente. */
  rutas(): Router {
    const rutas = Router();
    rutas.get('/:empresa/:archivo', async (req, res) => {
      const ruta = `${req.params.empresa}/${req.params.archivo}`;
      const parametros = new URLSearchParams(req.query as Record<string, string>);
      const firma = parametros.get('firma') ?? '';
      parametros.delete('firma');
      if (!this.#firmaValida(ruta, parametros, firma) || Number(parametros.get('expira')) < Date.now() / 1000) {
        throw new ErrorAplicacion(403, 'SIN_PERMISO', 'El enlace no es válido o ya caducó');
      }
      const archivo = this.#ubicar(ruta);
      const { size } = await stat(archivo).catch(() => {
        throw new ErrorAplicacion(404, 'NO_ENCONTRADO', 'El archivo no existe');
      });
      const nombre = parametros.get('nombre');
      res.set({
        'Content-Type': parametros.get('tipo') ?? 'application/octet-stream',
        'Content-Length': String(size),
        'Content-Disposition': nombre ? `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}` : 'inline',
      });
      createReadStream(archivo).pipe(res);
    });
    return rutas;
  }

  #firmar(ruta: string, parametros: URLSearchParams): string {
    const ordenados = new URLSearchParams([...parametros].sort(([a], [b]) => a.localeCompare(b)));
    return createHmac('sha256', this.#clave).update(`${ruta}?${ordenados}`).digest('base64url');
  }

  #firmaValida(ruta: string, parametros: URLSearchParams, firma: string): boolean {
    const esperada = Buffer.from(this.#firmar(ruta, parametros));
    const recibida = Buffer.from(firma);
    return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
  }

  // La ruta la genera la API, pero se comprueba igual: nunca se escribe ni se lee fuera de la carpeta.
  #ubicar(ruta: string): string {
    const destino = join(this.#directorio, ruta);
    if (!RUTA_VALIDA.test(ruta) || !destino.startsWith(this.#directorio + sep)) {
      throw new ErrorAplicacion(404, 'NO_ENCONTRADO', 'El archivo no existe');
    }
    return destino;
  }
}
