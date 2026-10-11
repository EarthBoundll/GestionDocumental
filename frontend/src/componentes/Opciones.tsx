import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface Opcion<T extends string> {
  valor: T;
  texto: string;
  icono?: LucideIcon;
  /** Un dibujo de cómo se verá: es decorativo, el nombre de la opción es su texto. */
  muestra?: ReactNode;
}

interface Props<T extends string> {
  /** El nombre del grupo de radios: uno por pantalla. */
  nombre: string;
  leyenda: string;
  ayuda?: ReactNode;
  valor: T;
  /** Dos o tres: caben en una fila también a 360 px. */
  opciones: readonly Opcion<T>[];
  alCambiar(valor: T): void;
}

/**
 * Unas pocas opciones cerradas, como tarjetas que se marcan (RF32, D47): el tema, el tamaño del texto, el estilo del
 * menú. Son radios de verdad, así que se recorren con las flechas del teclado y un lector de pantalla las anuncia.
 */
export function Opciones<T extends string>({ nombre, leyenda, ayuda, valor, opciones, alCambiar }: Props<T>) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{leyenda}</legend>
      {ayuda && <p className="mt-0.5 text-xs text-slate-500">{ayuda}</p>}
      <div className={`mt-2 grid gap-2 ${opciones.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {opciones.map(({ valor: opcion, texto, icono: Icono, muestra }) => (
          <label key={opcion}
            className="flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 text-center text-sm break-words hyphens-auto font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 has-checked:bg-marca-50 has-checked:text-marca-800 has-checked:ring-2 has-checked:ring-marca-600 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-marca-600">
            <input type="radio" name={nombre} value={opcion} checked={valor === opcion} onChange={() => alCambiar(opcion)} className="sr-only" />
            {Icono && <Icono aria-hidden className="size-5" />}
            {muestra && <span aria-hidden>{muestra}</span>}
            {texto}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
