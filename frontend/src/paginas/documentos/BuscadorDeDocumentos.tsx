import { Search } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { documentos } from '../../api/recursos';
import type { Sugerencia } from '../../api/tipos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { TEXTO_DE_COINCIDENCIA } from '../../utilidades/busqueda';

/** Lo que se espera desde la última tecla antes de pedir sugerencias: no una petición por letra. */
export const ESPERA_DE_SUGERENCIAS_MS = 300;

/**
 * Sugerencias mientras se escribe (D42), desde dos letras y tras una pausa. Cada tecla cancela la petición
 * anterior, así que una respuesta lenta nunca pisa a la más reciente. No quedan en el historial (D36).
 */
function useSugerencias(texto: string): Sugerencia[] {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  useEffect(() => {
    const limpio = texto.trim();
    if (limpio.length < 2) {
      setSugerencias([]);
      return;
    }
    const control = new AbortController();
    const espera = setTimeout(() => {
      documentos.sugerencias(limpio, control.signal)
        .then((respuesta) => {
          if (!control.signal.aborted) setSugerencias(respuesta.datos);
        })
        // Una sugerencia que no llega no impide buscar: el botón sigue ahí.
        .catch(() => {
          if (!control.signal.aborted) setSugerencias([]);
        });
    }, ESPERA_DE_SUGERENCIAS_MS);
    return () => {
      clearTimeout(espera);
      control.abort();
    };
  }, [texto]);
  return sugerencias;
}

/**
 * El campo de búsqueda con sugerencias, como un combobox accesible: ↓ y ↑ recorren las sugerencias, Enter
 * abre la elegida (o busca, si no hay ninguna marcada) y Esc las cierra. Buscar sigue siendo confirmar (D36).
 */
export function BuscadorDeDocumentos({ valor, alCambiar, alBuscar, alElegir }: {
  valor: string;
  alCambiar(texto: string): void;
  alBuscar(evento: FormEvent): void;
  alElegir(sugerencia: Sugerencia): void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const sugerencias = useSugerencias(abierto ? valor : '');
  const idLista = useId();
  const visibles = abierto && sugerencias.length > 0;
  const idDe = (posicion: number) => `${idLista}-${posicion}`;

  function elegir(sugerencia: Sugerencia) {
    setAbierto(false);
    alElegir(sugerencia);
  }

  function alPulsar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      if (!visibles) {
        setAbierto(true);
        return;
      }
      evento.preventDefault();
      // De −1 (el propio campo) a la última sugerencia, y vuelta a empezar.
      const ultima = sugerencias.length - 1;
      setActiva((actual) => (evento.key === 'ArrowDown'
        ? (actual >= ultima ? -1 : actual + 1)
        : (actual <= -1 ? ultima : actual - 1)));
    } else if (evento.key === 'Enter' && visibles && activa >= 0 && sugerencias[activa]) {
      evento.preventDefault();
      elegir(sugerencias[activa]);
    } else if (evento.key === 'Escape' && visibles) {
      evento.preventDefault();
      setAbierto(false);
      setActiva(-1);
    }
  }

  return (
    <form role="search" onSubmit={(evento) => { setAbierto(false); setActiva(-1); alBuscar(evento); }} className="flex gap-2">
      <div className="relative flex-1">
        <Campo
          etiqueta="Buscar documentos"
          type="search"
          placeholder="Ej.: facturas de proveedor, contrato, F001-0245…"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={visibles}
          aria-controls={idLista}
          aria-activedescendant={visibles && activa >= 0 ? idDe(activa) : undefined}
          autoComplete="off"
          enterKeyHint="search"
          value={valor}
          onChange={(evento) => { alCambiar(evento.target.value); setAbierto(true); setActiva(-1); }}
          onKeyDown={alPulsar}
          onBlur={() => setAbierto(false)}
        />
        <ul id={idLista} role="listbox" aria-label="Sugerencias"
          className={`absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-superficie shadow-lg motion-safe:animate-entrar ${visibles ? '' : 'hidden'}`}>
          {sugerencias.map((sugerencia, posicion) => (
            <li
              key={sugerencia.id}
              id={idDe(posicion)}
              role="option"
              aria-selected={posicion === activa}
              // mousedown se adelanta al blur del campo: sin esto, la lista se cerraría antes del clic.
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => elegir(sugerencia)}
              onMouseEnter={() => setActiva(posicion)}
              className={`cursor-pointer px-3 py-2 text-sm ${posicion === activa ? 'bg-marca-50' : ''}`}
            >
              <span className="line-clamp-2 font-medium text-slate-900">{sugerencia.nombre}</span>
              <span className="block text-xs text-slate-500">{sugerencia.categoria} · {TEXTO_DE_COINCIDENCIA[sugerencia.coincidencia]}</span>
            </li>
          ))}
        </ul>
      </div>
      <Boton type="submit" icono={Search} className="mt-7 self-start" aria-label="Buscar"><span className="hidden sm:inline">Buscar</span></Boton>
    </form>
  );
}
