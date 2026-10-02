import { BellOff, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { notificaciones } from '../../api/recursos';
import { Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { EncabezadoDePagina, ErrorDeCarga, Paginacion, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { formatearFechaHora } from '../../utilidades/formato';

export function Notificaciones() {
  const navegar = useNavigate();
  const [pagina, setPagina] = useState(1);
  const consulta = useConsulta((senal) => notificaciones.listar({ pagina }, senal), [pagina]);

  async function abrir(id: string, documentoId: string) {
    await notificaciones.marcarLeida(id).catch(() => {});
    navegar(`/documentos/${documentoId}`);
  }

  async function marcarTodas() {
    await notificaciones.marcarTodas().catch(() => {});
    consulta.recargar();
  }

  return (
    <>
      <EncabezadoDePagina
        titulo="Notificaciones"
        descripcion="Avisos de solicitudes de aprobación: las que te piden revisar y las respuestas a las tuyas."
        acciones={consulta.datos && consulta.datos.noLeidas > 0 && (
          <Boton variante="secundario" icono={CheckCheck} onClick={() => void marcarTodas()}>Marcar todas como leídas</Boton>
        )}
      />
      <Tarjeta>
        {consulta.error ? (
          <div className="p-4"><ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} /></div>
        ) : !consulta.datos ? (
          <Cargando />
        ) : consulta.datos.datos.length === 0 ? (
          <EstadoVacio icono={BellOff} titulo="No tienes notificaciones" />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {consulta.datos.datos.map((notificacion) => (
                <li key={notificacion.id}>
                  <button
                    type="button"
                    onClick={() => void abrir(notificacion.id, notificacion.documentoId)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${notificacion.leida ? 'bg-transparent' : 'bg-marca-600'}`} />
                    <span className="min-w-0">
                      <span className={`block text-sm ${notificacion.leida ? 'text-slate-600' : 'font-medium text-slate-900'}`}>
                        {notificacion.mensaje}
                        {!notificacion.leida && <span className="sr-only"> (sin leer)</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{formatearFechaHora(notificacion.creadaEn)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Paginacion {...consulta.datos.paginacion} alCambiar={setPagina} />
          </>
        )}
      </Tarjeta>
    </>
  );
}
