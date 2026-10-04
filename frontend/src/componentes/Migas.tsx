import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export interface PasoDeRuta {
  texto: string;
  /** Sin destino, es la pantalla actual. */
  a?: string;
}

/**
 * Dónde está la persona: «Documentos › Contratos › Contrato.pdf». Solo donde hay tres niveles; con dos,
 * el menú ya lo dice. El último paso es la pantalla actual y no es un enlace.
 */
export function Migas({ pasos }: { pasos: PasoDeRuta[] }) {
  return (
    <nav aria-label="Ruta" className="mb-2 text-sm">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 text-slate-600">
        {pasos.map((paso, indice) => (
          <li key={paso.texto + indice} className="flex min-w-0 items-center gap-1">
            {indice > 0 && <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400" />}
            {paso.a ? (
              <Link to={paso.a} className="inline-flex min-h-10 items-center rounded px-1 hover:text-slate-900">{paso.texto}</Link>
            ) : (
              <span aria-current="page" className="max-w-[60vw] truncate px-1 font-medium text-slate-900 sm:max-w-xs">{paso.texto}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
