import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorApi } from '../api/cliente';

export interface EstadoConsulta<T> {
  datos: T | undefined;
  error: ErrorApi | null;
  cargando: boolean;
  recargar(): void;
}

/**
 * Pide datos a la API cada vez que cambian las dependencias. Si cambian antes de que llegue la
 * respuesta anterior, la cancela: así una búsqueda lenta no pisa a la que el usuario hizo después.
 */
export function useConsulta<T>(obtener: (senal: AbortSignal) => Promise<T>, dependencias: unknown[]): EstadoConsulta<T> {
  const [datos, setDatos] = useState<T>();
  const [error, setError] = useState<ErrorApi | null>(null);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  const funcion = useRef(obtener);
  funcion.current = obtener;

  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    setError(null);
    funcion.current(control.signal)
      .then((resultado) => {
        if (!control.signal.aborted) setDatos(resultado);
      })
      .catch((causa: unknown) => {
        if (control.signal.aborted) return;
        setError(causa instanceof ErrorApi ? causa : new ErrorApi(0, 'ERROR', 'Ocurrió un error inesperado'));
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
    // Las dependencias las decide quien llama; la función se lee siempre en su versión más reciente.
  }, [...dependencias, version]);

  const recargar = useCallback(() => setVersion((anterior) => anterior + 1), []);
  return { datos, error, cargando, recargar };
}
