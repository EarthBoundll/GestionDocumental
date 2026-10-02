import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { notificaciones } from '../api/recursos';
import { useConsulta } from '../hooks/useConsulta';
import { formatearFechaHora } from '../utilidades/formato';

/**
 * Las notificaciones se piden al cambiar de pantalla y al volver a la pestaña, no cada pocos segundos:
 * el alcance excluye el tiempo real (D15), y así no se gasta la cuota del plan gratuito.
 */
export function Campana() {
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const [abierta, setAbierta] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const { datos, recargar } = useConsulta((senal) => notificaciones.listar({ porPagina: 5 }, senal), [ubicacion.pathname]);

  useEffect(() => {
    window.addEventListener('focus', recargar);
    return () => window.removeEventListener('focus', recargar);
  }, [recargar]);

  useEffect(() => {
    if (!abierta) return;
    const cerrarSiFuera = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierta(false);
    };
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierta(false);
    };
    document.addEventListener('mousedown', cerrarSiFuera);
    document.addEventListener('keydown', cerrarConEscape);
    return () => {
      document.removeEventListener('mousedown', cerrarSiFuera);
      document.removeEventListener('keydown', cerrarConEscape);
    };
  }, [abierta]);

  const noLeidas = datos?.noLeidas ?? 0;

  async function abrir(id: string, documentoId: string) {
    setAbierta(false);
    await notificaciones.marcarLeida(id).catch(() => {});
    navegar(`/documentos/${documentoId}`);
  }

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierta((valor) => !valor)}
        aria-expanded={abierta}
        aria-label={noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}
        className="relative rounded-lg p-2.5 text-slate-600 hover:bg-slate-100"
      >
        <Bell aria-hidden className="size-5" />
        {noLeidas > 0 && (
          <span className="absolute top-1 right-1 flex size-4.5 items-center justify-center rounded-full bg-red-600 text-[0.65rem] font-semibold text-white">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>
      {abierta && (
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200">
          <p className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Notificaciones</p>
          {datos && datos.datos.length > 0 ? (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {datos.datos.map((notificacion) => (
                <li key={notificacion.id}>
                  <button
                    type="button"
                    onClick={() => void abrir(notificacion.id, notificacion.documentoId)}
                    className={`block w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${notificacion.leida ? 'text-slate-600' : 'bg-marca-50/50 font-medium text-slate-900'}`}
                  >
                    {notificacion.mensaje}
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">{formatearFechaHora(notificacion.creadaEn)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No tienes notificaciones</p>
          )}
          <Link to="/notificaciones" onClick={() => setAbierta(false)} className="block border-t border-slate-200 px-4 py-3 text-center text-sm font-medium text-marca-700 hover:bg-slate-50">
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
