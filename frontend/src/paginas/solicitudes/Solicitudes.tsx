import { ClipboardCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { solicitudes } from '../../api/recursos';
import type { EstadoSolicitud } from '../../api/tipos';
import { Cargando, EstadoVacio } from '../../componentes/Avisos';
import { InsigniaDeEstado } from '../../componentes/Insignia';
import { EncabezadoDePagina, ErrorDeCarga, Paginacion, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { useSesion } from '../../sesion/SesionContext';
import { formatearFechaHora } from '../../utilidades/formato';

const PESTANAS: { estado?: EstadoSolicitud; texto: string }[] = [
  { texto: 'Todas' },
  { estado: 'pendiente', texto: 'Pendientes' },
  { estado: 'aprobada', texto: 'Aprobadas' },
  { estado: 'rechazada', texto: 'Rechazadas' },
];

export function Solicitudes() {
  const { esAdministrador } = useSesion();
  const [parametros, setParametros] = useSearchParams();
  const estado = (parametros.get('estado') as EstadoSolicitud | null) ?? undefined;
  const pagina = Number(parametros.get('pagina') ?? 1);
  const consulta = useConsulta((senal) => solicitudes.listar({ estado, pagina }, senal), [estado, pagina]);

  return (
    <>
      <EncabezadoDePagina
        titulo={esAdministrador ? 'Solicitudes de aprobación' : 'Mis solicitudes'}
        descripcion={esAdministrador
          ? 'Las de toda tu empresa. Las pendientes, primero: abre una para aprobarla o rechazarla.'
          : 'Las aprobaciones que has pedido y en qué quedaron.'}
      />

      <div role="tablist" aria-label="Filtrar por estado" className="mb-4 flex gap-1 overflow-x-auto">
        {PESTANAS.map((pestana) => (
          <button
            key={pestana.texto}
            role="tab"
            aria-selected={estado === pestana.estado}
            onClick={() => setParametros(pestana.estado ? { estado: pestana.estado } : {})}
            className={`min-h-10 rounded-lg px-3 text-sm font-medium whitespace-nowrap ${
              estado === pestana.estado ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {pestana.texto}
          </button>
        ))}
      </div>

      <Tarjeta>
        {consulta.error ? (
          <div className="p-4"><ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} /></div>
        ) : !consulta.datos ? (
          <Cargando />
        ) : consulta.datos.datos.length === 0 ? (
          <EstadoVacio icono={ClipboardCheck} titulo="No hay solicitudes">
            {esAdministrador ? 'Cuando alguien pida aprobar un documento, aparecerá aquí.' : 'Puedes pedir la aprobación desde la ficha de un documento que hayas subido.'}
          </EstadoVacio>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {consulta.datos.datos.map((solicitud) => (
                <li key={solicitud.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    {solicitud.documento.eliminado ? (
                      <p className="font-medium text-slate-500">{solicitud.documento.nombre} <span className="text-xs">(eliminado)</span></p>
                    ) : (
                      <Link to={`/documentos/${solicitud.documento.id}`} className="font-medium text-slate-900 hover:text-marca-700 hover:underline">
                        {solicitud.documento.nombre}
                      </Link>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {esAdministrador && <>{solicitud.solicitante.nombre} · </>}
                      {formatearFechaHora(solicitud.creadaEn)}
                      {solicitud.revisor && <> · Resuelta por {solicitud.revisor.nombre}</>}
                    </p>
                  </div>
                  <InsigniaDeEstado estado={solicitud.estado} />
                </li>
              ))}
            </ul>
            <Paginacion {...consulta.datos.paginacion} alCambiar={(nueva) => setParametros({ ...(estado && { estado }), pagina: String(nueva) })} />
          </>
        )}
      </Tarjeta>
    </>
  );
}
