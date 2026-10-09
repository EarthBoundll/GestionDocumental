import { ChevronDown, Download, Eye, FileDown, FileText, Search, SearchX, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ErrorApi } from '../../api/cliente';
import { categorias, documentos, type FiltrosDocumentos } from '../../api/recursos';
import type { DocumentoResumen } from '../../api/tipos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton, clasesDeBoton } from '../../componentes/Boton';
import { Campo, Selector } from '../../componentes/Campos';
import { Insignia } from '../../componentes/Insignia';
import { EncabezadoDePagina, ErrorDeCarga, Paginacion, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { useMedicionDeListado } from '../../hooks/useMedicionDeListado';
import { useParametrosEnUrl } from '../../hooks/useParametrosEnUrl';
import { useSesion } from '../../sesion/SesionContext';
import { abrirArchivo } from '../../utilidades/archivos';
import { formatearFecha, formatearPeso, nombreDeTipo } from '../../utilidades/formato';

const FILTROS = ['q', 'categoriaId', 'desde', 'hasta', 'orden'] as const;

export function ListaDocumentos() {
  const [parametros, cambiarParametros] = useParametrosEnUrl();
  const filtros: FiltrosDocumentos = {
    q: parametros.get('q') ?? undefined,
    categoriaId: parametros.get('categoriaId') ?? undefined,
    desde: parametros.get('desde') ?? undefined,
    hasta: parametros.get('hasta') ?? undefined,
    orden: (parametros.get('orden') as FiltrosDocumentos['orden']) ?? undefined,
    pagina: Number(parametros.get('pagina') ?? 1),
  };
  const hayFiltros = FILTROS.some((filtro) => filtro !== 'orden' && parametros.get(filtro));
  const filtrosPlegados = (['orden', 'desde', 'hasta'] as const).filter((filtro) => parametros.get(filtro)).length;
  // En el celular, orden y fechas van plegados para que los resultados quepan en la primera pantalla;
  // si alguno está en uso, empiezan a la vista para que nadie busque con un filtro que no ve.
  const [masFiltros, setMasFiltros] = useState(filtrosPlegados > 0);
  const resultados = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState(filtros.q ?? '');
  const [errorAlAbrir, setErrorAlAbrir] = useState<ErrorApi | null>(null);
  const { esAdministrador } = useSesion();
  const [exportando, setExportando] = useState(false);

  const medicion = useMedicionDeListado();
  const listado = useConsulta(async (senal) => {
    const alRecibir = medicion.empezar();
    const respuesta = await documentos.listar(filtros, senal);
    alRecibir(respuesta.tiempoRespuestaId);
    return respuesta;
  }, [parametros.toString()]);
  const { datos: lista } = useConsulta((senal) => categorias.listar(false, senal), []);

  useEffect(() => {
    if (listado.datos) medicion.terminar();
  }, [listado.datos, medicion]);

  // Cambiar un filtro vuelve a la primera página.
  function aplicar(cambios: Partial<Record<(typeof FILTROS)[number] | 'pagina', string | undefined>>) {
    cambiarParametros((siguientes) => {
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor) siguientes.set(clave, valor);
        else siguientes.delete(clave);
      }
      if (!('pagina' in cambios)) siguientes.delete('pagina');
    });
  }

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    aplicar({ q: texto.trim() || undefined });
    // En una pantalla táctil el teclado tapa la lista: se cierra y los resultados quedan a la vista.
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      (document.activeElement as HTMLElement | null)?.blur();
      const sinAnimaciones = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      resultados.current?.scrollIntoView({ behavior: sinAnimaciones ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /** RF35: el inventario en CSV, con los filtros de la pantalla. Lo exporta un administrador y queda registrado. */
  async function exportarListado() {
    setExportando(true);
    setErrorAlAbrir(null);
    const { pagina: _pagina, orden: _orden, ...soloFiltros } = filtros;
    await documentos.exportarListado(soloFiltros).catch((error: ErrorApi) => setErrorAlAbrir(error));
    setExportando(false);
  }

  async function abrir(id: string, modo: 'ver' | 'descargar') {
    setErrorAlAbrir(null);
    await abrirArchivo(id, modo).catch((error: ErrorApi) => setErrorAlAbrir(error));
  }

  return (
    <>
      <EncabezadoDePagina
        titulo="Documentos"
        descripcion="Busca por nombre, sin preocuparte por las tildes ni las mayúsculas."
        acciones={<>
          {esAdministrador && (
            <Boton variante="secundario" icono={FileDown} cargando={exportando} onClick={() => void exportarListado()}>Exportar listado</Boton>
          )}
          <Link to="/documentos/nuevo" className={clasesDeBoton()}><Upload aria-hidden className="size-4" />Subir documento</Link>
        </>}
      />

      <Tarjeta className="mb-4 p-4">
        <form role="search" onSubmit={buscar} className="flex gap-2">
          <div className="flex-1">
            <Campo etiqueta="Buscar por nombre" className="" type="search" placeholder="Ej.: cotización, contrato de alquiler…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <Boton type="submit" icono={Search} className="mt-7 self-start" aria-label="Buscar"><span className="hidden sm:inline">Buscar</span></Boton>
        </form>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Selector etiqueta="Categoría" value={filtros.categoriaId ?? ''} onChange={(e) => aplicar({ categoriaId: e.target.value || undefined })}>
              <option value="">Todas</option>
              {lista?.datos.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
            </Selector>
          </div>
          <button
            type="button"
            aria-expanded={masFiltros}
            aria-controls="filtros-plegables"
            onClick={() => setMasFiltros(!masFiltros)}
            className="col-span-2 -my-1 flex items-center gap-1 justify-self-start rounded-md py-1 text-sm font-medium text-marca-700 sm:hidden"
          >
            <ChevronDown aria-hidden className={`size-4 transition-transform ${masFiltros ? 'rotate-180' : ''}`} />
            {masFiltros ? 'Menos filtros' : 'Más filtros'}
            {!masFiltros && filtrosPlegados > 0 && <span className="text-slate-500">({filtrosPlegados} en uso)</span>}
          </button>
          {/* «contents»: en pantallas anchas los tres campos son celdas más de la misma cuadrícula, siempre visibles. */}
          <div id="filtros-plegables" className={`${masFiltros ? 'contents' : 'hidden'} sm:contents`}>
            <div className="col-span-2 sm:col-span-1">
              <Selector etiqueta="Ordenar por" value={filtros.orden ?? 'recientes'} onChange={(e) => aplicar({ orden: e.target.value === 'recientes' ? undefined : e.target.value })}>
                <option value="recientes">Subidos recientemente</option>
                <option value="fecha">Fecha del documento</option>
                <option value="nombre">Nombre</option>
              </Selector>
            </div>
            <Campo etiqueta="Desde" type="date" value={filtros.desde ?? ''} onChange={(e) => aplicar({ desde: e.target.value || undefined })} />
            <Campo etiqueta="Hasta" type="date" value={filtros.hasta ?? ''} onChange={(e) => aplicar({ hasta: e.target.value || undefined })} />
          </div>
        </div>
      </Tarjeta>

      {errorAlAbrir && <div className="mb-4"><Aviso tipo="error">{errorAlAbrir.mensaje}</Aviso></div>}

      {/* scroll-mt: el encabezado fijo (h-16) no tapa el primer resultado al llevarlo a la vista. */}
      <div ref={resultados} className="scroll-mt-20">
        <Tarjeta>
          {listado.error ? (
            <div className="p-4"><ErrorDeCarga error={listado.error} alReintentar={listado.recargar} /></div>
          ) : !listado.datos ? (
            <Cargando texto="Buscando documentos…" />
          ) : listado.datos.datos.length === 0 ? (
            hayFiltros ? (
              <EstadoVacio
                icono={SearchX}
                titulo="Ningún documento coincide"
                accion={<Boton variante="secundario" onClick={() => { setTexto(''); cambiarParametros((siguientes) => [...siguientes.keys()].forEach((clave) => siguientes.delete(clave))); }}>Quitar los filtros</Boton>}
              >
                Prueba con menos palabras o con otra categoría.
              </EstadoVacio>
            ) : (
              <EstadoVacio icono={FileText} titulo="Aún no hay documentos" accion={<Link to="/documentos/nuevo" className={clasesDeBoton()}>Subir el primero</Link>}>
                Sube un documento y aparecerá aquí, listo para encontrarlo desde cualquier dispositivo.
              </EstadoVacio>
            )
          ) : (
            <>
              <p className="sr-only" aria-live="polite">{listado.datos.paginacion.total} documentos encontrados</p>
              <ul className={`escalonado divide-y divide-slate-100 ${listado.cargando ? 'opacity-60' : ''}`}>
                {listado.datos.datos.map((documento) => (
                  <FilaDeDocumento key={documento.id} documento={documento} alAbrir={(modo) => void abrir(documento.id, modo)} />
                ))}
              </ul>
              <Paginacion {...listado.datos.paginacion} alCambiar={(pagina) => aplicar({ pagina: String(pagina) })} />
            </>
          )}
        </Tarjeta>
      </div>
    </>
  );
}

function FilaDeDocumento({ documento, alAbrir }: { documento: DocumentoResumen; alAbrir(modo: 'ver' | 'descargar'): void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-xs font-semibold text-marca-800 sm:flex">
        {nombreDeTipo(documento.archivo.tipoMime)}
      </div>
      <div className="min-w-0 flex-1">
        {/* Varias líneas, no una: en un celular caben unos 22 caracteres por línea, y lo que distingue un documento
            (número, cliente) suele ir al final del nombre. Tres líneas allí y dos en pantallas anchas cubren casi todos. */}
        <Link to={`/documentos/${documento.id}`} className="-my-1 line-clamp-3 py-1 font-medium break-words text-slate-900 hover:text-marca-700 hover:underline sm:line-clamp-2">
          {documento.nombre}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <Insignia tono="marca">{documento.categoria.nombre}</Insignia>
          <span>{formatearFecha(documento.fechaDocumento)}</span>
          <span aria-hidden className="hidden sm:inline">·</span>
          <span>{documento.subidoPor.nombre}</span>
          <span aria-hidden className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">{formatearPeso(documento.archivo.pesoBytes)}</span>
        </div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Boton variante="fantasma" tamano="pequeno" icono={Eye} onClick={() => alAbrir('ver')} aria-label={`Ver ${documento.nombre}`}>
          <span className="hidden md:inline">Ver</span>
        </Boton>
        <Boton variante="fantasma" tamano="pequeno" icono={Download} onClick={() => alAbrir('descargar')} aria-label={`Descargar ${documento.nombre}`}>
          <span className="hidden md:inline">Descargar</span>
        </Boton>
      </div>
    </li>
  );
}
