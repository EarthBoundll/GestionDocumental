import { Building2, ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { plataforma } from '../../api/recursos';
import { Cargando, EstadoVacio } from '../../componentes/Avisos';
import { clasesDeBoton } from '../../componentes/Boton';
import { Insignia } from '../../componentes/Insignia';
import { EncabezadoDePagina, ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { formatearFechaHora, formatearPeso } from '../../utilidades/formato';

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

/**
 * La portada del Administrador Master: cifras de la plataforma y de cada empresa. Solo conteos; el
 * contenido de las empresas no es visible desde aquí, y la API tampoco lo entregaría (decisión E).
 */
export function Resumen() {
  // Una tras otra: si la primera responde 403, la segunda no se pide y queda un solo intento registrado.
  const consulta = useConsulta(async (senal) => {
    const metricas = await plataforma.metricas(senal);
    return { metricas, empresas: (await plataforma.empresas(senal)).datos };
  }, []);

  if (consulta.error) return <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />;
  const { metricas, empresas } = consulta.datos ?? {};
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
          <Cifra titulo="Almacenamiento" valor={formatearPeso(metricas.almacenamientoBytes)} />
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
          <ul className="divide-y divide-slate-100">
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
                      {numero(empresa.metricas.usuariosActivos)} usuarios activos · {numero(empresa.metricas.documentos)} documentos
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
