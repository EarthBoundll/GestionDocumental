import { History, Monitor, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { documentos } from '../../api/recursos';
import type { ActividadDeDocumento } from '../../api/tipos';
import { Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { detalleDeActividad, fraseDeActividad } from '../../utilidades/acciones';
import { formatearFechaHora } from '../../utilidades/formato';

const DE_A_POCO = 10;
/** El máximo que la API entrega de una vez; lo anterior sigue en el Historial. */
const MAXIMO = 100;

/** El color del punto de cada paso: verde lo aprobado, rojo lo rechazado o denegado, el resto neutro. */
function tonoDe(accion: string): string {
  if (accion === 'SOLICITUD_APROBADA') return 'bg-emerald-500';
  if (accion === 'SOLICITUD_RECHAZADA' || accion === 'ACCESO_DENEGADO') return 'bg-red-500';
  if (accion === 'DOCUMENTO_VISUALIZADO' || accion === 'DOCUMENTO_DESCARGADO') return 'bg-slate-300';
  return 'bg-marca-600';
}

function autorDe({ usuario, rolUsuario }: ActividadDeDocumento): string {
  if (usuario) return usuario.nombre;
  return rolUsuario === 'master' ? 'La administración de la plataforma' : 'El sistema';
}

/**
 * La línea de tiempo de la ficha (RF30): el indicador 4 visto documento por documento. Un administrador
 * ve además quién lo vio y lo descargó; el resto, solo su ciclo de vida.
 */
export function ActividadDelDocumento({ documentoId, conConsultas }: { documentoId: string; conConsultas: boolean }) {
  const [cuantos, setCuantos] = useState(DE_A_POCO);
  const consulta = useConsulta((senal) => documentos.actividad(documentoId, cuantos, senal), [documentoId, cuantos]);
  const total = consulta.datos?.paginacion.total ?? 0;
  const pasos = consulta.datos?.datos ?? [];

  return (
    <Tarjeta className="mt-4 p-4 sm:p-6">
      <h2 className="font-semibold text-slate-900">Actividad</h2>
      <p className="mt-1 mb-4 text-sm text-slate-600">
        {conConsultas
          ? 'Todo lo que pasó con este documento, también quién lo vio y lo descargó. Sale del historial, que nadie puede modificar.'
          : 'Lo que pasó con este documento desde que se subió. Sale del historial, que nadie puede modificar.'}
      </p>
      {consulta.error ? (
        <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />
      ) : !consulta.datos && consulta.cargando ? (
        <Cargando />
      ) : pasos.length === 0 ? (
        <EstadoVacio icono={History} titulo="Todavía no hay actividad" />
      ) : (
        <>
          <ol className="relative ml-1.5 border-l border-slate-200" aria-label="Actividad del documento">
            {pasos.map((paso) => <Paso key={paso.id} paso={paso} />)}
          </ol>
          {pasos.length < total && cuantos < MAXIMO && (
            <Boton variante="secundario" cargando={consulta.cargando} onClick={() => setCuantos((n) => Math.min(n + 20, MAXIMO))}>
              Ver más ({total - pasos.length})
            </Boton>
          )}
          {pasos.length < total && cuantos >= MAXIMO && conConsultas && (
            <p className="text-sm text-slate-600">Lo anterior está en el Historial de la empresa.</p>
          )}
        </>
      )}
    </Tarjeta>
  );
}

function Paso({ paso }: { paso: ActividadDeDocumento }) {
  const detalle = detalleDeActividad(paso.detalle);
  const Dispositivo = paso.esMovil ? Smartphone : Monitor;
  return (
    <li className="mb-4 ml-4 last:mb-2">
      <span aria-hidden className={`absolute -left-1.5 mt-1.5 size-3 rounded-full ring-4 ring-superficie ${tonoDe(paso.accion)}`} />
      <p className="text-sm text-slate-800">
        <span className="font-medium text-slate-900">{autorDe(paso)}</span> {fraseDeActividad(paso.accion, paso.detalle)}
      </p>
      {detalle && <p className="mt-0.5 text-sm break-words text-slate-600">{detalle}</p>}
      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
        <time dateTime={paso.creadoEn}>{formatearFechaHora(paso.creadoEn)}</time>
        {paso.esMovil !== null && (
          <>
            <span aria-hidden>·</span>
            <Dispositivo aria-hidden className="size-3.5" />
            <span>{paso.esMovil ? 'desde un celular' : 'desde un ordenador'}</span>
          </>
        )}
      </p>
    </li>
  );
}
