import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

type Variante = 'primario' | 'secundario' | 'peligro' | 'fantasma';
type Tamano = 'normal' | 'pequeno';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-accion text-white hover:bg-accion-hover disabled:bg-accion/60',
  secundario: 'bg-superficie text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  peligro: 'bg-peligro text-white hover:bg-peligro-hover disabled:bg-peligro/60',
  fantasma: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-400',
};

const TAMANOS: Record<Tamano, string> = {
  // 44 px de alto: el mínimo cómodo para tocar con el dedo en un celular.
  normal: 'min-h-11 px-4 text-sm gap-2',
  pequeno: 'min-h-9 px-3 text-sm gap-1.5',
};

/** Las clases de un botón, para usarlas también en un enlace que debe parecerlo. */
export function clasesDeBoton(variante: Variante = 'primario', tamano: Tamano = 'normal'): string {
  return `inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTES[variante]} ${TAMANOS[tamano]}`;
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: Tamano;
  icono?: LucideIcon;
  cargando?: boolean;
}

export function Boton({ variante, tamano, icono: Icono, cargando = false, disabled, children, className = '', type = 'button', ...resto }: Props) {
  return (
    <button type={type} disabled={disabled || cargando} aria-busy={cargando} className={`${clasesDeBoton(variante, tamano)} ${className}`} {...resto}>
      {cargando ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : Icono && <Icono aria-hidden className="size-4" />}
      {children}
    </button>
  );
}
