import { Building2, ChevronRight, DatabaseBackup, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { plataforma } from '../../api/recursos';
import { Cargando, EstadoVacio } from '../../componentes/Avisos';
import { clasesDeBoton } from '../../componentes/Boton';
import { Insignia } from '../../componentes/Insignia';
import { EncabezadoDePagina, ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { contar, formatearFechaHora, formatearPeso, instanteDeRespaldo } from '../../utilidades/formato';

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Tarjeta className="p-4">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </Tarjeta>
  );
}

const numero = (valor: number) => valor.toLocaleString('es-PE');

/** La capa gratuita de Supabase Storage: 1 GB entre todos los buckets, documentos y respaldos juntos. */
const ESPACIO_GRATUITO_BYTES = 1024 ** 3;
/** Desde aquí conviene avisar: llenar el espacio impide subir documentos a todas las empresas a la vez. */
const UMBRAL_DE_AVISO = 0.8;

type Respaldo = { nombre: string; bytes: number };

/**
 * La portada del Administrador Master: cifras de la plataforma y de cada empresa. Solo conteos; el
 * contenido de las empresas no es visible desde aquí, y la API tampoco lo entregaría (decisión E).
 */
export function Resumen() {
  // Una tras otra: si la primera responde 403, la segunda no se pide y queda un solo intento registrado.
  const consulta = useConsulta(async (senal) => {
    const metricas = await plataforma.metricas(senal);
    const empresas = (await plataforma.empresas(senal)).datos;
    // Los respaldos se leen del bucket, otro servicio: si no responde, el resto del resumen se muestra igual.
    const respaldos = await plataforma.respaldos(senal).then((r) => r.datos).catch(() => null);
    return { metricas, empresas, respaldos };
  }, []);

  if (consulta.error) return <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />;
  const { metricas, empresas, respaldos } = consulta.datos ?? {};
  return (
    <>
      <EncabezadoDePagina
        titulo="Plataforma"
        descripcion="Las empresas que usan el sistema y sus cifras. El contenido de cada empresa solo lo ven sus usuarios."
        acciones={<Link to="/plataforma/empresas/nueva" className={clasesDeBoton()}><Plus aria-hidden className="size-4" />Nueva empresa</Link>}
      />

      {metricas && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra titulo="Empresas activas" valor={numero(metricas.empresasActivas)} detalle={`de ${numero(metricas.empresas)} registradas`} />
          <Cifra titulo="Usuarios activos" valor={numero(metricas.usuariosActivos)} detalle={`de ${numero(metricas.usuarios)}`} />
          <Cifra titulo="Documentos" valor={numero(metricas.documentos)} />
          <Cifra titulo="Almacenamiento" valor={formatearPeso(metricas.almacenamientoBytes)} detalle="de los documentos" />
        </div>
      )}

      {metricas && respaldos !== undefined && (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          <EspacioDeArchivos documentosBytes={metricas.almacenamientoBytes} respaldos={respaldos} />
          <UltimoRespaldo respaldos={respaldos} />
        </div>
      )}

      <Tarjeta>
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-900">Empresas</h2>
        {!empresas ? (
          <Cargando />
        ) : empresas.length === 0 ? (
          <EstadoVacio icono={Building2} titulo="Aún no hay empresas"
            accion={<Link to="/plataforma/empresas/nueva" className={clasesDeBoton()}>Registrar la primera</Link>}>
            Cada empresa nace con su primer administrador, que después crea al resto de su equipo.
          </EstadoVacio>
        ) : (
          <ul className="escalonado divide-y divide-slate-100">
            {empresas.map((empresa) => (
              <li key={empresa.id}>
                <Link to={`/plataforma/empresas/${empresa.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium ${empresa.activa ? 'text-slate-900' : 'text-slate-400'}`}>
                      {empresa.nombre}
                      {!empresa.activa && <span className="ml-2 align-middle"><Insignia tono="peligro">Desactivada</Insignia></span>}
                    </p>
                    <p className="text-sm text-slate-500">
                      {empresa.ruc ? `RUC ${empresa.ruc} · ` : ''}
                      {contar(empresa.metricas.usuariosActivos, 'usuario activo', 'usuarios activos')} · {contar(empresa.metricas.documentos, 'documento')}
                      {' · '}{formatearPeso(empresa.metricas.almacenamientoBytes)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {empresa.metricas.ultimoAcceso ? `Último acceso: ${formatearFechaHora(empresa.metricas.ultimoAcceso)}` : 'Nadie ha entrado todavía'}
                    </p>
                  </div>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}

/** El espacio de archivos frente al límite gratuito: lo que la plataforma puede crecer antes de pagar. */
function EspacioDeArchivos({ documentosBytes, respaldos }: { documentosBytes: number; respaldos: Respaldo[] | null }) {
  const respaldosBytes = respaldos?.reduce((suma, respaldo) => suma + respaldo.bytes, 0) ?? 0;
  const usado = documentosBytes + respaldosBytes;
  const fraccion = Math.min(1, usado / ESPACIO_GRATUITO_BYTES);
  const porcentaje = (fraccion * 100).toLocaleString('es-PE', { maximumFractionDigits: 1 });
  const alto = fraccion >= UMBRAL_DE_AVISO;
  return (
    <Tarjeta className="p-4">
      <p className="text-sm text-slate-500">Espacio de archivos</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{formatearPeso(usado)} <span className="text-base font-normal text-slate-500">de 1 GB</span></p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label="Espacio de archivos usado"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraccion * 100)} aria-valuetext={`${porcentaje} % de 1 GB`}>
        <div className={`h-full rounded-full ${alto ? 'bg-amber-500' : 'bg-marca-600'}`} style={{ width: `${Math.max(fraccion * 100, usado > 0 ? 1 : 0)}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {porcentaje} % del límite gratuito de Supabase: documentos {formatearPeso(documentosBytes)}
        {respaldos ? `, respaldos ${formatearPeso(respaldosBytes)}` : ' (los respaldos no se pudieron consultar)'}.
        {alto && ' Conviene liberar espacio antes de que se llene: sin espacio, ninguna empresa puede subir documentos.'}
      </p>
    </Tarjeta>
  );
}

/** Que el respaldo nocturno corre se comprueba de un vistazo, sin entrar a la pantalla de respaldos. */
function UltimoRespaldo({ respaldos }: { respaldos: Respaldo[] | null }) {
  const ultimo = respaldos?.[0];
  return (
    <Tarjeta className="p-4">
      <p className="flex items-center gap-2 text-sm text-slate-500"><DatabaseBackup aria-hidden className="size-4" /> Último respaldo</p>
      {respaldos === null ? (
        <p className="mt-1 text-sm text-slate-700">No se pudo consultar el depósito de respaldos. Inténtalo desde la pantalla de respaldos.</p>
      ) : !ultimo ? (
        <p className="mt-1 text-sm text-slate-700">Aún no hay respaldos. El primero se genera esta noche.</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{formatearFechaHora(instanteDeRespaldo(ultimo.nombre))}</p>
          <p className="mt-0.5 text-xs text-slate-500">{formatearPeso(ultimo.bytes)} · {contar(respaldos.length, 'respaldo guardado', 'respaldos guardados')}</p>
        </>
      )}
      <Link to="/plataforma/respaldos" className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-marca-700 hover:text-marca-800">
        Ver los respaldos <ChevronRight aria-hidden className="size-4" />
      </Link>
    </Tarjeta>
  );
}
