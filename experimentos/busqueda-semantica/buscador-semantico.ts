import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { PRIMEROS } from './buscador-actual.js';
import type { Documento } from './corpus.js';

/**
 * multilingual-e5-small: entiende español, devuelve vectores de 384 números y, cuantizado a 8 bits, pesa
 * unos 120 MB. Corre dentro del proceso: ningún texto sale hacia un tercero. Licencia MIT.
 */
export const MODELO = 'Xenova/multilingual-e5-small';
const CARPETA_DEL_MODELO = fileURLToPath(new URL('./.modelos', import.meta.url));

export interface Resultado {
  clave: string;
  similitud: number;
}

export interface Recursos {
  cargaMs: number;
  memoriaAntesMb: number;
  memoriaDespuesMb: number;
  disco: number;
  /** Tiempo de CPU de convertir cada texto en vector, en milisegundos. */
  cpuPorDocumentoMs: number[];
  cpuPorBusquedaMs: number[];
}

/** e5 distingue lo que se busca de lo que se guarda con un prefijo en cada texto. */
const comoBusqueda = (texto: string) => `query: ${texto}`;
const comoDocumento = (texto: string) => `passage: ${texto}`;

export const textoDeMetadatos = (documento: Documento) =>
  [documento.nombre, `Categoría: ${documento.categoria}`, documento.descripcion].filter(Boolean).join('. ');
export const textoConContenido = (documento: Documento) =>
  [textoDeMetadatos(documento), documento.texto.replaceAll('\n', ' ')].filter(Boolean).join('. ');

export async function cargarModelo(recursos: Partial<Recursos>): Promise<FeatureExtractionPipeline> {
  env.cacheDir = CARPETA_DEL_MODELO;
  recursos.memoriaAntesMb = megabytes(process.memoryUsage().rss);
  const inicio = performance.now();
  const extractor = await pipeline('feature-extraction', MODELO, { dtype: 'q8' });
  recursos.cargaMs = performance.now() - inicio;
  recursos.memoriaDespuesMb = megabytes(process.memoryUsage().rss);
  recursos.disco = await tamanoDeCarpeta(CARPETA_DEL_MODELO);
  return extractor;
}

/** Un buscador por similitud de vectores: cada documento se convierte una vez, como se haría al subirlo. */
export async function prepararBuscadorSemantico(
  extractor: FeatureExtractionPipeline,
  corpus: Documento[],
  textoDe: (documento: Documento) => string,
  cpuPorDocumentoMs: number[] = [],
) {
  const vectores = new Map<string, Float32Array>();
  for (const documento of corpus) {
    const { vector, cpuMs } = await vectorDe(extractor, comoDocumento(textoDe(documento)));
    vectores.set(documento.clave, vector);
    cpuPorDocumentoMs.push(cpuMs);
  }
  return {
    async buscar(texto: string, cpuPorBusquedaMs?: number[]): Promise<Resultado[]> {
      const { vector, cpuMs } = await vectorDe(extractor, comoBusqueda(texto));
      cpuPorBusquedaMs?.push(cpuMs);
      return [...vectores]
        .map(([clave, delDocumento]) => ({ clave, similitud: producto(vector, delDocumento) }))
        .sort((a, b) => b.similitud - a.similitud)
        .slice(0, PRIMEROS);
    },
  };
}

async function vectorDe(extractor: FeatureExtractionPipeline, texto: string) {
  const antes = process.cpuUsage();
  const salida = await extractor(texto, { pooling: 'mean', normalize: true });
  const { user, system } = process.cpuUsage(antes);
  return { vector: Float32Array.from(salida.data as Float32Array), cpuMs: (user + system) / 1000 };
}

/** Con vectores normalizados, el producto escalar es la similitud del coseno. */
function producto(a: Float32Array, b: Float32Array): number {
  let suma = 0;
  for (let i = 0; i < a.length; i++) suma += a[i]! * b[i]!;
  return suma;
}

const megabytes = (bytes: number) => bytes / 1024 / 1024;

async function tamanoDeCarpeta(carpeta: string): Promise<number> {
  let total = 0;
  for (const entrada of await readdir(carpeta, { withFileTypes: true, recursive: true })) {
    if (entrada.isFile()) total += (await stat(join(entrada.parentPath, entrada.name))).size;
  }
  return total;
}
