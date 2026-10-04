import { ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { plataforma } from '../../api/recursos';
import { Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Campo, Selector } from '../../componentes/Campos';
import { EncabezadoDePagina, ErrorDeCarga, Paginacion, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { NOMBRES_DE_ACCIONES } from '../../utilidades/acciones';
import { FilaDeHistorial } from '../admin/Historial';

/** Las acciones que puede haber en la auditoría de la plataforma: las del Master y los accesos sin empresa. */
const ACCIONES_DE_PLATAFORMA = [
  'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA', 'CLAVE_RESTABLECIDA',
  'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA', 'USUARIO_CREADO', 'USUARIO_EDITADO',
  'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA', 'RESPALDO_GENERADO',
];

type Filtro = 'empresaId' | 'accion' | 'desde' | 'hasta' | 'pagina';

/**
 * RF27: la auditoría del Master. Ve lo que hizo la plataforma —también sobre cada empresa— y los intentos
 * de entrar con correos que no existen. La actividad de las personas de cada empresa no está aquí (D18).
 */
export function Auditoria() {
  const [parametros, setParametros] = useSearchParams();
  const leer = (clave: Filtro) => parametros.get(clave) ?? undefined;
  const filtros = { empresaId: leer('empresaId'), accion: leer('accion'), desde: leer('desde'), hasta: leer('hasta'), pagina: Number(leer('pagina') ?? 1) };
  const consulta = useConsulta((senal) => plataforma.auditoria(filtros, senal), [parametros.toString()]);
  const { datos: empresas } = useConsulta((senal) => plataforma.empresas(senal), []);

  function filtrar(clave: Filtro, valor: string) {
    const siguientes = new URLSearchParams(parametros);
    if (valor) siguientes.set(clave, valor);
    else siguientes.delete(clave);
    if (clave !== 'pagina') siguientes.delete('pagina');
    setParametros(siguientes);
  }

  return (
    <>
      <EncabezadoDePagina
        titulo="Auditoría de la plataforma"
        descripcion="Lo que hizo la administración de la plataforma y los intentos de acceso sin empresa. La actividad dentro de cada empresa solo la ve esa empresa."
      />
      <Tarjeta className="mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <Selector etiqueta="Empresa" value={filtros.empresaId ?? ''} onChange={(e) => filtrar('empresaId', e.target.value)}>
          <option value="">Todas</option>
          {empresas?.datos.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>)}
        </Selector>
        <Selector etiqueta="Acción" value={filtros.accion ?? ''} onChange={(e) => filtrar('accion', e.target.value)}>
          <option value="">Todas</option>
          {ACCIONES_DE_PLATAFORMA.map((accion) => <option key={accion} value={accion}>{NOMBRES_DE_ACCIONES[accion]}</option>)}
        </Selector>
        <Campo etiqueta="Desde" type="date" value={filtros.desde ?? ''} onChange={(e) => filtrar('desde', e.target.value)} />
        <Campo etiqueta="Hasta" type="date" value={filtros.hasta ?? ''} onChange={(e) => filtrar('hasta', e.target.value)} />
      </Tarjeta>
      <Tarjeta>
        {consulta.error ? (
          <div className="p-4"><ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} /></div>
        ) : !consulta.datos ? (
          <Cargando />
        ) : consulta.datos.datos.length === 0 ? (
          <EstadoVacio icono={ShieldCheck} titulo="No hay acciones con estos filtros" />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {consulta.datos.datos.map((asiento) => <FilaDeHistorial key={asiento.id} asiento={asiento} conEmpresa />)}
            </ul>
            <Paginacion {...consulta.datos.paginacion} alCambiar={(pagina) => filtrar('pagina', String(pagina))} />
          </>
        )}
      </Tarjeta>
    </>
  );
}
