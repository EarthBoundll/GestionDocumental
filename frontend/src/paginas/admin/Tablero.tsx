import { ChevronRight, FileDown, History, LayoutDashboard } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ErrorApi } from '../../api/cliente';
import { historial, tablero } from '../../api/recursos';
import type { Tablero as DatosDelTablero } from '../../api/tipos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { EncabezadoDePagina, ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { useParametrosEnUrl } from '../../hooks/useParametrosEnUrl';
import { contar, formatearFecha, formatearPeso } from '../../utilidades/formato';
import { FilaDeHistorial } from './Historial';

const numero = (valor: number) => valor.toLocaleString('es-PE');
const enPorcentaje = (valor: number | null) => (valor === null ? '—' : `${valor.toLocaleString('es-PE')} %`);
const enMs = (valor: number | null) => (valor === null ? '—' : `${numero(valor)} ms`);

/**
 * RF28: el estado de la empresa y lo que el sistema registra de cada indicador de la tesis en un
 * periodo. Lo que el sistema no sabe —cuándo empezó una tarea cronometrada, qué documentos se pidieron—
 * lo pone el protocolo de prueba; el tablero lo dice en vez de inventarlo.
 */
export function Tablero() {
  const [parametros, cambiarParametros] = useParametrosEnUrl();
  const periodo = { desde: parametros.get('desde') ?? undefined, hasta: parametros.get('hasta') ?? undefined };
  const consulta = useConsulta((senal) => tablero.obtener(periodo, senal), [parametros.toString()]);
  const [exportando, setExportando] = useState(false);
  const [errorAlExportar, setErrorAlExportar] = useState<ErrorApi | null>(null);

  function cambiar(clave: 'desde' | 'hasta', valor: string) {
    cambiarParametros((siguientes) => {
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
    });
  }

  async function exportar(datos: DatosDelTablero) {
    setExportando(true);
    setErrorAlExportar(null);
    await historial.exportar(datos.periodo).catch((error: ErrorApi) => setErrorAlExportar(error));
    setExportando(false);
  }

  if (consulta.error?.estado === 403) return <ErrorDeCarga error={consulta.error} />;
  const datos = consulta.datos;
  return (
    <>
      <EncabezadoDePagina
        titulo="Tablero"
        descripcion="El estado de tu empresa y lo que el sistema registra de cada indicador en el periodo elegido."
        acciones={datos && (
          <Boton variante="secundario" icono={FileDown} cargando={exportando} onClick={() => void exportar(datos)}>Historial del periodo (CSV)</Boton>
        )}
      />
      {errorAlExportar && <div className="mb-4"><Aviso tipo="error">{errorAlExportar.mensaje}</Aviso></div>}
      <Tarjeta className="mb-4 grid grid-cols-2 items-start gap-3 p-4 sm:max-w-md">
        <Campo etiqueta="Desde" type="date" value={datos?.periodo.desde ?? periodo.desde ?? ''} onChange={(e) => cambiar('desde', e.target.value)}
          ayuda="Sin fechas, los últimos 30 días." />
        <Campo etiqueta="Hasta" type="date" value={datos?.periodo.hasta ?? periodo.hasta ?? ''} onChange={(e) => cambiar('hasta', e.target.value)}
          ayuda="Días completos, en hora de Lima." />
      </Tarjeta>
      {consulta.error ? (
        <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />
      ) : !datos ? (
        <Tarjeta><Cargando /></Tarjeta>
      ) : (
        <Contenido datos={datos} />
      )}
    </>
  );
}

function Contenido({ datos }: { datos: DatosDelTablero }) {
  const { resumen, indicadores: i } = datos;
  return (
    <div className="space-y-4">
      <div className="escalonado grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra titulo="Documentos" valor={numero(resumen.documentos)} nota={`${numero(resumen.enPapelera)} en la papelera`} />
        <Cifra titulo="Almacenamiento" valor={formatearPeso(resumen.almacenamientoBytes)} nota="incluye la papelera" />
        <Cifra titulo="Usuarios activos" valor={`${numero(resumen.usuariosActivos)} de ${numero(resumen.usuarios)}`} nota={`${numero(resumen.categoriasActivas)} categorías activas`} />
        <Cifra titulo="Solicitudes pendientes" valor={numero(resumen.solicitudesPendientes)} nota="esperan revisión" />
      </div>

      <Tarjeta className="p-4">
        <h2 className="text-sm font-semibold text-slate-900">Indicadores de la tesis</h2>
        <p className="mt-1 text-xs text-slate-500">
          Del {formatearFecha(datos.periodo.desde)} al {formatearFecha(datos.periodo.hasta)}. Los tiempos de las tareas se toman con cronómetro;
          estas cifras los corroboran y salen del historial, que puedes exportar.
        </p>
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          <Indicador numero={1} titulo="Organización y categorización">
            {contar(i.organizacion.subidos, 'documento subido', 'documentos subidos')} y{' '}
            {contar(i.organizacion.editados, 'edición', 'ediciones')}.
          </Indicador>
          <Indicador numero={2} titulo="Búsqueda">
            {contar(i.busqueda.busquedas, 'búsqueda con filtros', 'búsquedas con filtros')} y{' '}
            {contar(i.busqueda.listados, 'consulta del listado', 'consultas del listado')}.
          </Indicador>
          <Indicador numero={3} titulo="Recuperación">
            {contar(i.recuperacion.documentosObtenidos, 'documento distinto obtenido', 'documentos distintos obtenidos')}{' '}
            ({contar(i.recuperacion.visualizaciones, 'vista')}, {contar(i.recuperacion.descargas, 'descarga')}). Búsquedas con resultado: {enPorcentaje(i.recuperacion.porcentajeBusquedasConResultado)}.
          </Indicador>
          <Indicador numero={4} titulo="Acciones en el historial">
            {contar(i.historial.acciones, 'acción registrada', 'acciones registradas')}. El porcentaje se calcula contra el guion de la prueba.
          </Indicador>
          <Indicador numero={5} titulo="Acceso desde el celular">
            {enPorcentaje(i.accesoRemoto.porcentajeExitoMovil)} de éxito ({numero(i.accesoRemoto.sesionesDesdeMovil)} de{' '}
            {numero(i.accesoRemoto.intentosDesdeMovil)} intentos desde móvil; {numero(i.accesoRemoto.sesiones)} sesiones en total).
          </Indicador>
          <Indicador numero={6} titulo="Accesos según rol">
            {contar(i.accesosPorRol.denegados, 'acceso denegado y registrado', 'accesos denegados y registrados')}
            {i.accesosPorRol.porPermiso.length > 0 && <>: {i.accesosPorRol.porPermiso.map((p) => `${p.permiso.toLowerCase().replaceAll('_', ' ')} (${p.total})`).join(', ')}</>}.
          </Indicador>
          <Indicador numero={7} titulo="Tiempo de respuesta del listado">
            Mediana {enMs(i.tiempoRespuesta.servidorMediana)} en el servidor y {enMs(i.tiempoRespuesta.navegadorMediana)} en el navegador;
            percentil 95: {enMs(i.tiempoRespuesta.servidorP95)} / {enMs(i.tiempoRespuesta.navegadorP95)} ({numero(i.tiempoRespuesta.mediciones)} mediciones).
          </Indicador>
        </dl>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="p-4">
          <h2 className="text-sm font-semibold text-slate-900">Flujo de aprobación</h2>
          <p className="mt-1 text-xs text-slate-500">Solicitudes del periodo y cómo se resolvieron.</p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Resultado titulo="Solicitadas" valor={datos.aprobacion.solicitadas} />
            <Resultado titulo="Aprobadas" valor={datos.aprobacion.aprobadas} tono="text-emerald-700" />
            <Resultado titulo="Rechazadas" valor={datos.aprobacion.rechazadas} tono="text-red-700" />
          </dl>
          <Link to="/solicitudes" className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-marca-700 hover:text-marca-800">
            {contar(resumen.solicitudesPendientes, 'solicitud pendiente', 'solicitudes pendientes')} ahora <ChevronRight aria-hidden className="size-4" />
          </Link>
        </Tarjeta>

        <Tarjeta className="p-4">
          <h2 className="text-sm font-semibold text-slate-900">Actividad diaria</h2>
          <Actividad dias={datos.actividad} />
        </Tarjeta>
      </div>

      <Tarjeta>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Actividad reciente</h2>
          <Link to="/admin/historial" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-marca-700 hover:text-marca-800">
            Todo el historial <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
        {datos.recientes.length === 0 ? (
          <EstadoVacio icono={History} titulo="Todavía no hay actividad" />
        ) : (
          <ul className="escalonado divide-y divide-slate-100" aria-label="Actividad reciente">
            {datos.recientes.map((asiento) => <FilaDeHistorial key={asiento.id} asiento={asiento} />)}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

function Resultado({ titulo, valor, tono = 'text-slate-900' }: { titulo: string; valor: number; tono?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <dt className="text-xs font-medium text-slate-500">{titulo}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${tono}`}>{numero(valor)}</dd>
    </div>
  );
}

function Cifra({ titulo, valor, nota }: { titulo: string; valor: string; nota: string }) {
  return (
    <Tarjeta className="p-4">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{nota}</p>
    </Tarjeta>
  );
}

function Indicador({ numero: n, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <dt className="text-xs font-semibold text-marca-700">Indicador {n} · {titulo}</dt>
      <dd className="mt-1 text-sm text-slate-700">{children}</dd>
    </div>
  );
}

/** Barras por día, en CSS: un gráfico sin librerías, que se lee también con lector de pantalla. */
function Actividad({ dias }: { dias: DatosDelTablero['actividad'] }) {
  const maximo = Math.max(1, ...dias.map((dia) => dia.acciones));
  if (dias.every((dia) => dia.acciones === 0)) {
    return <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><LayoutDashboard className="size-4" aria-hidden /> Sin actividad en el periodo.</p>;
  }
  return (
    <ol className="mt-3 flex h-32 items-end gap-px" aria-label="Acciones registradas por día">
      {dias.map((dia) => (
        <li key={dia.dia} className="flex h-full flex-1 items-end" title={`${formatearFecha(dia.dia)}: ${dia.acciones} acciones`}>
          <span className="sr-only">{formatearFecha(dia.dia)}: {dia.acciones} acciones</span>
          <span aria-hidden className="w-full rounded-t bg-marca-500" style={{ height: `${(dia.acciones / maximo) * 100}%`, minHeight: dia.acciones ? 2 : 0 }} />
        </li>
      ))}
    </ol>
  );
}
