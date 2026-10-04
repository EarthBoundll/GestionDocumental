import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Los filtros de una pantalla, guardados en la URL. `cambiar` parte del último cambio pedido, no del
 * último que se pintó: react-router aplica la navegación en una transición, y en un celular lento dos
 * filtros seguidos (borrar la búsqueda y elegir una categoría) partirían los dos de la URL anterior y el
 * segundo desharía el primero.
 */
export function useParametrosEnUrl() {
  const [parametros, setParametros] = useSearchParams();
  const pendiente = useRef<string | null>(null);
  const actuales = parametros.toString();

  useEffect(() => {
    if (pendiente.current === actuales) pendiente.current = null;
  }, [actuales]);

  const cambiar = useCallback((modificar: (siguientes: URLSearchParams) => void) => {
    const siguientes = new URLSearchParams(pendiente.current ?? actuales);
    modificar(siguientes);
    pendiente.current = siguientes.toString();
    setParametros(siguientes);
  }, [actuales, setParametros]);

  return [parametros, cambiar] as const;
}
