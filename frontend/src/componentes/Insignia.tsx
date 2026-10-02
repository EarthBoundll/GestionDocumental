import type { ReactNode } from 'react';
import type { EstadoSolicitud } from '../api/tipos';

type Tono = 'neutro' | 'marca' | 'exito' | 'peligro' | 'advertencia';

const TONOS: Record<Tono, string> = {
  neutro: 'bg-slate-100 text-slate-700',
  marca: 'bg-marca-50 text-marca-800',
  exito: 'bg-emerald-50 text-emerald-800',
  peligro: 'bg-red-50 text-red-800',
  advertencia: 'bg-amber-50 text-amber-800',
};

export function Insignia({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${TONOS[tono]}`}>{children}</span>;
}

const ESTADOS: Record<EstadoSolicitud, { texto: string; tono: Tono }> = {
  pendiente: { texto: 'Pendiente de aprobación', tono: 'advertencia' },
  aprobada: { texto: 'Aprobado', tono: 'exito' },
  rechazada: { texto: 'Rechazado', tono: 'peligro' },
};

export function InsigniaDeEstado({ estado }: { estado: EstadoSolicitud }) {
  const { texto, tono } = ESTADOS[estado];
  return <Insignia tono={tono}>{texto}</Insignia>;
}
