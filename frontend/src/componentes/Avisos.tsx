import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Tipo = 'info' | 'exito' | 'error' | 'advertencia';

const ESTILOS: Record<Tipo, { clases: string; icono: LucideIcon }> = {
  info: { clases: 'bg-sky-50 text-sky-900 ring-sky-200', icono: Info },
  exito: { clases: 'bg-emerald-50 text-emerald-900 ring-emerald-200', icono: CircleCheck },
  error: { clases: 'bg-red-50 text-red-900 ring-red-200', icono: CircleX },
  advertencia: { clases: 'bg-amber-50 text-amber-900 ring-amber-200', icono: TriangleAlert },
};

/** Un mensaje en la página. Los de error se anuncian en cuanto aparecen. */
export function Aviso({ tipo = 'info', children, accion }: { tipo?: Tipo; children: ReactNode; accion?: ReactNode }) {
  const { clases, icono: Icono } = ESTILOS[tipo];
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg p-3 text-sm ring-1 ${clases}`}>
      <Icono aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="flex-1">{children}</div>
      {accion}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      {texto}
    </div>
  );
}

export function EstadoVacio({ icono: Icono, titulo, children, accion }: { icono: LucideIcon; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3">
        <Icono aria-hidden className="size-6 text-slate-500" />
      </div>
      <h2 className="font-medium text-slate-900">{titulo}</h2>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-600">{children}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}
