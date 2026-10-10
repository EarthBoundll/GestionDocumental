import { PRIMEROS } from './buscador-actual.js';

/** Cómo le fue a un buscador con una búsqueda que tiene respuesta correcta. */
export interface Medida {
  /** El primer resultado es correcto. */
  enElPrimero: boolean;
  /** Hay al menos uno correcto en los cinco primeros. */
  enLosCinco: boolean;
  /** 1 / posición del primer correcto en los cinco primeros, o 0: lo que promedia la MRR. */
  reciproco: number;
  /** Correctos entre los cinco primeros, sobre los que cabían (cinco, o menos si hay menos correctos). */
  precision: number;
}

export function medir(resultados: string[], correctos: string[]): Medida {
  const primeros = resultados.slice(0, PRIMEROS);
  const posicion = primeros.findIndex((clave) => correctos.includes(clave));
  const acertados = primeros.filter((clave) => correctos.includes(clave)).length;
  return {
    enElPrimero: posicion === 0,
    enLosCinco: posicion >= 0,
    reciproco: posicion >= 0 ? 1 / (posicion + 1) : 0,
    precision: acertados / Math.min(PRIMEROS, correctos.length),
  };
}

export interface Resumen {
  busquedas: number;
  enElPrimero: number;
  enLosCinco: number;
  mrr: number;
  precision: number;
}

export function resumir(medidas: Medida[]): Resumen {
  const promedio = (valores: number[]) => valores.reduce((suma, valor) => suma + valor, 0) / (valores.length || 1);
  return {
    busquedas: medidas.length,
    enElPrimero: medidas.filter((medida) => medida.enElPrimero).length,
    enLosCinco: medidas.filter((medida) => medida.enLosCinco).length,
    mrr: promedio(medidas.map((medida) => medida.reciproco)),
    precision: promedio(medidas.map((medida) => medida.precision)),
  };
}

export function percentil(valores: number[], p: number): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)] ?? 0;
}
