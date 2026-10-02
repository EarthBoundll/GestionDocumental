import { useCallback, useRef } from 'react';
import { tiemposRespuesta } from '../api/recursos';

/**
 * La parte del navegador del indicador 7: desde justo antes de pedir el listado hasta que el resultado
 * está en pantalla. Si el envío falla se pierde esa medición y nada más: nunca molesta a quien busca.
 */
export function useMedicionDeListado() {
  const pendiente = useRef<{ inicio: number; id: string } | null>(null);

  /** Al pedir: devuelve la función que se llama con el id de medición que trae la respuesta. */
  const empezar = useCallback(() => {
    const inicio = performance.now();
    return (id: string | null) => {
      pendiente.current = id ? { inicio, id } : null;
    };
  }, []);

  /** En un efecto, tras pintar el resultado. */
  const terminar = useCallback(() => {
    const medicion = pendiente.current;
    if (!medicion) return;
    pendiente.current = null;
    // El efecto corre al actualizar el DOM; el siguiente fotograma ya está pintado.
    requestAnimationFrame(() => setTimeout(() => {
      const duracion = Math.round(performance.now() - medicion.inicio);
      if (duracion <= 120_000) void tiemposRespuesta.completar(medicion.id, duracion).catch(() => {});
    }, 0));
  }, []);

  return { empezar, terminar };
}
