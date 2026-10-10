import type { ReactNode } from 'react';
import type { EstadoDeCorreo, EstadoSolicitud } from '../api/tipos';

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

const CORREO: Record<Exclude<EstadoDeCorreo, 'verificado'>, { texto: string; explicacion: string }> = {
  pendiente: { texto: 'Pendiente de activar', explicacion: 'Aún no abrió su invitación: no puede entrar hasta definir su contraseña.' },
  sin_verificar: { texto: 'Correo sin verificar', explicacion: 'Tiene contraseña, pero debe confirmar su correo con el enlace que le llegó.' },
};

/** D41: solo se ve mientras la cuenta no puede entrar por su correo; una verificada no lleva insignia. */
export function InsigniaDeCorreo({ estado }: { estado: EstadoDeCorreo }) {
  if (estado === 'verificado') return null;
  const { texto, explicacion } = CORREO[estado];
  return <span title={explicacion}><Insignia tono="advertencia">{texto}</Insignia></span>;
}
