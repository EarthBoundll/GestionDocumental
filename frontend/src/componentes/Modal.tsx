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
      className="m-auto w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl bg-superficie p-0 text-slate-800 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] motion-safe:open:animate-emerger motion-safe:backdrop:animate-aparecer"
    >
      {/* En un celular el formulario puede no caber: se desplaza el contenido, y título y botones quedan a la vista. */}
      <div className="flex max-h-[calc(100dvh-3rem)] flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id={idTitulo} className="text-base font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="-mr-2 rounded-lg p-2.5 text-slate-500 hover:bg-slate-100">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {acciones && <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:justify-end">{acciones}</div>}
      </div>
    </dialog>
  );
}
