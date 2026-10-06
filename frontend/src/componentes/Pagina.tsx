import { ChevronLeft, ChevronRight, ShieldX } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ErrorApi } from '../api/cliente';
import { Aviso, EstadoVacio } from './Avisos';
import { Boton } from './Boton';

export function EncabezadoDePagina({ titulo, descripcion, acciones }: { titulo: string; descripcion?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-slate-600">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-superficie shadow-xs ring-1 ring-slate-200 ${className}`}>{children}</section>;
}

/**
 * Lo que se muestra cuando una carga falla. Un 403 no es un fallo de la aplicación: la API decidió que
 * este usuario no puede verlo, y ya lo registró (D8).
 */
export function ErrorDeCarga({ error, alReintentar }: { error: ErrorApi; alReintentar?: () => void }) {
  if (error.estado === 403) {
    return (
      <EstadoVacio icono={ShieldX} titulo="No tienes permiso para ver esto">
        Tu rol no permite entrar en esta sección, y el intento quedó registrado. Si crees que deberías poder, consúltalo con un administrador.
      </EstadoVacio>
    );
  }
  return (
    <Aviso tipo="error" accion={alReintentar && <Boton variante="secundario" tamano="pequeno" onClick={alReintentar}>Reintentar</Boton>}>
      {error.mensaje}
    </Aviso>
  );
}

export function Paginacion({ pagina, porPagina, total, alCambiar }: { pagina: number; porPagina: number; total: number; alCambiar(pagina: number): void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas === 1) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>{desde}–{hasta} de {total}</span>
      <div className="flex gap-2">
        <Boton variante="secundario" tamano="pequeno" icono={ChevronLeft} disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
          Anterior
        </Boton>
        <Boton variante="secundario" tamano="pequeno" disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>
          Siguiente
          <ChevronRight aria-hidden className="size-4" />
        </Boton>
      </div>
    </nav>
  );
}
