import { FileDown, History, Monitor, Smartphone } from 'lucide-react';
import { useState } from 'react';
import type { ErrorApi } from '../../api/cliente';
import { historial, usuarios, type FiltrosHistorial } from '../../api/recursos';
import type { Asiento } from '../../api/tipos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo, Selector } from '../../componentes/Campos';
import { Insignia } from '../../componentes/Insignia';
import { EncabezadoDePagina, ErrorDeCarga, Paginacion, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { useParametrosEnUrl } from '../../hooks/useParametrosEnUrl';
import { NOMBRES_DE_ACCIONES, resumirDetalle } from '../../utilidades/acciones';
import { formatearFechaHora } from '../../utilidades/formato';
import { NOMBRES_DE_ROLES } from '../../utilidades/roles';

export function Historial() {
  const [parametros, cambiarParametros] = useParametrosEnUrl();
  const filtros: FiltrosHistorial = {
    usuarioId: parametros.get('usuarioId') ?? undefined,
    accion: parametros.get('accion') ?? undefined,
    desde: parametros.get('desde') ?? undefined,
    hasta: parametros.get('hasta') ?? undefined,
    pagina: Number(parametros.get('pagina') ?? 1),
  };
  const consulta = useConsulta((senal) => historial.listar(filtros, senal), [parametros.toString()]);
  const { datos: personas } = useConsulta((senal) => usuarios.listar({ porPagina: 100 }, senal), []);
  const [exportando, setExportando] = useState(false);
  const [errorAlExportar, setErrorAlExportar] = useState<ErrorApi | null>(null);

  function filtrar(clave: keyof FiltrosHistorial, valor: string) {
    cambiarParametros((siguientes) => {
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
      if (clave !== 'pagina') siguientes.delete('pagina');
    });
  }

  async function exportar() {
    setExportando(true);
    setErrorAlExportar(null);
    const { pagina: _pagina, ...sinPagina } = filtros;
    await historial.exportar(sinPagina).catch((error: ErrorApi) => setErrorAlExportar(error));
    setExportando(false);
  }

  if (consulta.error?.estado === 403) return <ErrorDeCarga error={consulta.error} />;
  return (
    <>
      <EncabezadoDePagina
        titulo="Historial"
        descripcion="Cada acción del sistema, con quién, cuándo y desde qué dispositivo. No se puede modificar ni borrar."
        acciones={<Boton variante="secundario" icono={FileDown} cargando={exportando} onClick={() => void exportar()}>Exportar a CSV</Boton>}
      />
      {errorAlExportar && <div className="mb-4"><Aviso tipo="error">{errorAlExportar.mensaje}</Aviso></div>}

      <Tarjeta className="mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <Selector etiqueta="Persona" value={filtros.usuarioId ?? ''} onChange={(e) => filtrar('usuarioId', e.target.value)}>
          <option value="">Todas</option>
          {personas?.datos.map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre}</option>)}
        </Selector>
        <Selector etiqueta="Acción" value={filtros.accion ?? ''} onChange={(e) => filtrar('accion', e.target.value)}>
          <option value="">Todas</option>
          {Object.entries(NOMBRES_DE_ACCIONES).map(([accion, nombre]) => <option key={accion} value={accion}>{nombre}</option>)}
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
          <EstadoVacio icono={History} titulo="No hay acciones con estos filtros" />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {consulta.datos.datos.map((asiento) => <FilaDeHistorial key={asiento.id} asiento={asiento} />)}
            </ul>
            <Paginacion {...consulta.datos.paginacion} alCambiar={(pagina) => filtrar('pagina', String(pagina))} />
          </>
        )}
      </Tarjeta>
    </>
  );
}

/**
 * El Master no es de la empresa y su cuenta no se ve desde ella: sus acciones salen como de la plataforma.
 * Sin autor ni correo, quien actuó fue el propio sistema (la purga de la papelera).
 */
function autorDe(asiento: Asiento): string {
  if (asiento.rolUsuario === 'master') return 'Administración de la plataforma';
  if (asiento.usuario) return asiento.usuario.nombre;
  if (asiento.detalle.email) return String(asiento.detalle.email);
  return asiento.accion === 'DOCUMENTO_PURGADO' || asiento.accion === 'RESPALDO_GENERADO' ? 'El sistema' : 'Correo desconocido';
}

/** Una acción del historial. Con `conEmpresa`, dice además en qué empresa ocurrió (la auditoría del Master). */
export function FilaDeHistorial({ asiento, conEmpresa = false }: { asiento: Asiento; conEmpresa?: boolean }) {
  const denegado = asiento.accion === 'ACCESO_DENEGADO' || asiento.accion === 'SESION_FALLIDA';
  const Dispositivo = asiento.esMovil ? Smartphone : Monitor;
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-sm">
      <Dispositivo aria-label={asiento.esMovil ? 'Desde un móvil' : 'Desde un ordenador'} className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Insignia tono={denegado ? 'peligro' : 'neutro'}>{NOMBRES_DE_ACCIONES[asiento.accion] ?? asiento.accion}</Insignia>
            <span className="font-medium text-slate-900">{autorDe(asiento)}</span>
            {asiento.rolUsuario && <span className="text-xs text-slate-500">{NOMBRES_DE_ROLES[asiento.rolUsuario]}</span>}
            {conEmpresa && asiento.empresa && <Insignia tono="marca">{asiento.empresa.nombre}</Insignia>}
          </p>
          <Resumen asiento={asiento} />
        </div>
        <time dateTime={asiento.creadoEn} className="shrink-0 text-xs whitespace-nowrap text-slate-500">{formatearFechaHora(asiento.creadoEn)}</time>
      </div>
    </li>
  );
}

function Resumen({ asiento }: { asiento: Asiento }) {
  const partes = resumirDetalle(asiento.detalle);
  if (partes.length === 0) return null;
  return <p className="mt-1 break-words text-slate-600">{partes.join(' · ')}</p>;
}
