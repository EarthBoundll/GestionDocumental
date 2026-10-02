import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  abierto: boolean;
  alCerrar(): void;
  titulo: string;
  children: ReactNode;
  /** Los botones del pie. */
  acciones?: ReactNode;
}

/**
 * Un diálogo modal con el elemento <dialog> del navegador: atrapa el foco, se cierra con Escape y
 * devuelve el foco a donde estaba, sin código propio que pueda fallar en algún navegador.
 */
export function Modal({ abierto, alCerrar, titulo, children, acciones }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const elemento = dialogo.current;
    if (!elemento) return;
    if (abierto && !elemento.open) elemento.showModal();
    if (!abierto && elemento.open) elemento.close();
  }, [abierto]);

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={idTitulo}
      onClose={alCerrar}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl p-0 shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 id={idTitulo} className="text-base font-semibold text-slate-900">{titulo}</h2>
        <button type="button" onClick={alCerrar} aria-label="Cerrar" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
      {acciones && <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:justify-end">{acciones}</div>}
    </dialog>
  );
}
