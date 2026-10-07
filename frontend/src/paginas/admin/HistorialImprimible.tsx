import { ArrowLeft, History, Printer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { historial, usuarios, type FiltrosHistorial } from '../../api/recursos';
import { Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton, clasesDeBoton } from '../../componentes/Boton';
import { ErrorDeCarga } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { useSesion } from '../../sesion/SesionContext';
import { NOMBRES_DE_ACCIONES, resumirDetalle } from '../../utilidades/acciones';
import { contar, formatearFecha, formatearFechaHora } from '../../utilidades/formato';
import { NOMBRES_DE_ROLES } from '../../utilidades/roles';
import { autorDe } from './Historial';

function describirPeriodo({ desde, hasta }: FiltrosHistorial): string {
  if (desde && hasta) return `del ${formatearFecha(desde)} al ${formatearFecha(hasta)}`;
  if (desde) return `desde el ${formatearFecha(desde)}`;
  if (hasta) return `hasta el ${formatearFecha(hasta)}`;
  return 'todo el historial';
}

/**
 * RF36: el historial filtrado, entero y en una tabla, para imprimirlo o guardarlo como PDF con el diálogo del
 * navegador (sin librerías). Es el anexo firmable de cada sesión de evaluación del capítulo 3. Pedirlo queda
 * en el historial como una exportación más: lo registra la API.
 */
export function HistorialImprimible() {
  const [parametros] = useSearchParams();
  const { sesion } = useSesion();
  const filtros: FiltrosHistorial = {
    usuarioId: parametros.get('usuarioId') ?? undefined,
    accion: parametros.get('accion') ?? undefined,
    desde: parametros.get('desde') ?? undefined,
    hasta: parametros.get('hasta') ?? undefined,
  };
  const consulta = useConsulta((senal) => historial.paraImprimir(filtros, senal), [parametros.toString()]);
  const { datos: personas } = useConsulta((senal) => usuarios.listar({ porPagina: 100 }, senal), []);
  const [generadoEn] = useState(() => new Date().toISOString());

  const empresa = sesion?.empresa;
  const nombreDeLaEmpresa = empresa?.marca.nombreComercial ?? empresa?.nombre ?? '';
  const periodo = describirPeriodo(filtros);
  const persona = filtros.usuarioId ? (personas?.datos.find((p) => p.id === filtros.usuarioId)?.nombre ?? 'una persona') : 'todas';
  const accion = filtros.accion ? (NOMBRES_DE_ACCIONES[filtros.accion] ?? filtros.accion) : 'todas';

  // El título de la pestaña es el nombre que el navegador propone al guardar el PDF.
  useEffect(() => {
    const anterior = document.title;
    document.title = `Historial de ${nombreDeLaEmpresa}, ${periodo}`;
    return () => {
      document.title = anterior;
    };
  }, [nombreDeLaEmpresa, periodo]);

  return (
    <article className="text-sm text-slate-900">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to={`/admin/historial?${parametros.toString()}`} className={clasesDeBoton('fantasma')}>
          <ArrowLeft aria-hidden className="size-4" />Volver al historial
        </Link>
        <Boton icono={Printer} onClick={() => window.print()} disabled={!consulta.datos}>Imprimir o guardar como PDF</Boton>
      </div>

      <header className="mb-4 border-b border-slate-300 pb-3">
        <p className="text-xs font-medium tracking-wide text-slate-600 uppercase">Historial de actividad</p>
        <h1 className="text-xl font-semibold">{nombreDeLaEmpresa}</h1>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 print:grid-cols-4">
          <Dato termino="Periodo">{periodo}</Dato>
          <Dato termino="Persona">{persona}</Dato>
          <Dato termino="Acción">{accion}</Dato>
          <Dato termino="Asientos">{consulta.datos ? consulta.datos.total : '…'}</Dato>
        </dl>
      </header>

      {consulta.error ? (
        <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />
      ) : !consulta.datos ? (
        <Cargando />
      ) : consulta.datos.datos.length === 0 ? (
        <EstadoVacio icono={History} titulo="No hay acciones con estos filtros" />
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[40rem] border-collapse text-left text-xs print:min-w-0">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600">
                <th scope="col" className="py-1.5 pr-3 font-medium">Fecha y hora</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Persona</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Acción</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">Detalle</th>
                <th scope="col" className="py-1.5 font-medium">Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {consulta.datos.datos.map((asiento) => (
                <tr key={asiento.id} className="break-inside-avoid border-b border-slate-200 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{formatearFechaHora(asiento.creadoEn)}</td>
                  <td className="py-1.5 pr-3">
                    {autorDe(asiento)}
                    {asiento.rolUsuario && <span className="block text-slate-600">{NOMBRES_DE_ROLES[asiento.rolUsuario]}</span>}
                  </td>
                  <td className="py-1.5 pr-3">{NOMBRES_DE_ACCIONES[asiento.accion] ?? asiento.accion}</td>
                  <td className="py-1.5 pr-3 break-words">{resumirDetalle(asiento.detalle).join(' · ')}</td>
                  <td className="py-1.5 whitespace-nowrap">{asiento.esMovil === null ? '—' : asiento.esMovil ? 'Celular' : 'Computadora'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-8 break-inside-avoid">
        <p className="text-xs text-slate-600">
          Generado el {formatearFechaHora(generadoEn)} por {sesion?.usuario.nombre}, con {consulta.datos ? contar(consulta.datos.total, 'asiento') : '…'}.
          El historial no se puede modificar ni borrar: esta hoja es una copia de lo que registró el sistema.
        </p>
        <div className="mt-14 grid grid-cols-2 gap-10 text-xs text-slate-600">
          <p className="border-t border-slate-400 pt-1">Revisado por (nombre, firma y fecha)</p>
          <p className="border-t border-slate-400 pt-1">Conformidad (nombre, firma y fecha)</p>
        </div>
      </footer>
    </article>
  );
}

function Dato({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-slate-600">{termino}:</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
