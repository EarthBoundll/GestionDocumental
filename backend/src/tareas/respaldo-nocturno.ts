import type pg from 'pg';
import { SIN_AUTOR } from '../modulos/historial/historial.registro.js';
import type { DepositoDeRespaldos } from '../respaldos/deposito.js';
import { respaldar } from '../respaldos/respaldo.js';

/** Las 03:00 en Lima (UTC-5, sin horario de verano): la hora con menos uso en una MYPE. */
const HORA_UTC = 8;
const DIA_MS = 86_400_000;

/** Cuánto falta para la próxima hora de respaldo. */
export function msHastaElProximo(ahora = new Date()): number {
  const proximo = new Date(ahora);
  proximo.setUTCHours(HORA_UTC, 0, 0, 0);
  if (proximo <= ahora) proximo.setTime(proximo.getTime() + DIA_MS);
  return proximo.getTime() - ahora.getTime();
}

/**
 * Programa el respaldo nocturno en este proceso (RF29). El monitor de Supabase llama a la API cada 10
 * minutos (D13), así que a las 03:00 está despierta. Si un día falla, queda en el registro de Render y
 * la noche siguiente se intenta otra vez.
 */
export function programarRespaldos(pool: pg.Pool, deposito: DepositoDeRespaldos): () => void {
  let temporizador: NodeJS.Timeout;
  const siguiente = () => {
    temporizador = setTimeout(() => {
      respaldar(pool, deposito, { autor: SIN_AUTOR, contexto: null })
        .then(({ nombre, bytes }) => console.log(`[respaldos] guardado ${nombre} (${bytes} bytes)`))
        .catch((error: unknown) => console.error('[respaldos] el respaldo nocturno falló:', error))
        .finally(siguiente);
    }, msHastaElProximo());
    temporizador.unref();
  };
  siguiente();
  return () => clearTimeout(temporizador);
}
