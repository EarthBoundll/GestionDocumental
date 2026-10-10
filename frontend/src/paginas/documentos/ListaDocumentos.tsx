import { ChevronDown, Download, Eye, FileDown, FileText, SearchX, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ErrorApi } from '../../api/cliente';
import { categorias, documentos, usuarios, type FiltrosDocumentos } from '../../api/recursos';
import type { DocumentoResumen, EstadoDeAprobacion, Sugerencia, TipoDeArchivo } from '../../api/tipos';
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
import {
  ATAJOS_DE_FECHA, atajoDelRango, ESTADOS_DE_APROBACION, rangoDeAtajo, TEXTO_DE_COINCIDENCIA, TIPOS_DE_ARCHIVO,
} from '../../utilidades/busqueda';
import { contar, formatearFecha, formatearPeso, nombreDeTipo } from '../../utilidades/formato';
import { BuscadorDeDocumentos } from './BuscadorDeDocumentos';

const FILTROS = ['q', 'categoriaId', 'tipo', 'estado', 'subidoPor', 'fechaDe', 'desde', 'hasta', 'orden'] as const;
type Filtro = (typeof FILTROS)[number];
/** Los que en el celular van tras «Más filtros»: la categoría y el texto quedan siempre a la vista. */
const PLEGABLES = ['tipo', 'estado', 'subidoPor', 'fechaDe', 'desde', 'hasta', 'orden'] as const;

export function ListaDocumentos() {
  const [parametros, cambiarParametros] = useParametrosEnUrl();
  const leer = (filtro: Filtro) => parametros.get(filtro) ?? undefined;
  const filtros: FiltrosDocumentos = {
    q: leer('q'),
    categoriaId: leer('categoriaId'),
    tipo: leer('tipo') as TipoDeArchivo | undefined,
    estado: leer('estado') as EstadoDeAprobacion | undefined,
    subidoPor: leer('subidoPor'),
    fechaDe: leer('fechaDe') as FiltrosDocumentos['fechaDe'],
    desde: leer('desde'),
    hasta: leer('hasta'),
    orden: leer('orden') as FiltrosDocumentos['orden'],
    pagina: Number(parametros.get('pagina') ?? 1),
  };
  const hayFiltros = FILTROS.some((filtro) => filtro !== 'orden' && filtro !== 'fechaDe' && parametros.get(filtro));
  const filtrosPlegados = PLEGABLES.filter((filtro) => parametros.get(filtro)).length;
  // En el celular los filtros secundarios van plegados para que los resultados quepan en la primera pantalla;
  // si alguno está en uso, empiezan a la vista para que nadie busque con un filtro que no ve.
  const [masFiltros, setMasFiltros] = useState(filtrosPlegados > 0);
  const resultados = useRef<HTMLDivElement>(null);
  const [texto, setTexto] = useState(filtros.q ?? '');
  const [errorAlAbrir, setErrorAlAbrir] = useState<ErrorApi | null>(null);
  const { sesion, esAdministrador } = useSesion();
  const [exportando, setExportando] = useState(false);
  const navegar = useNavigate();

  const medicion = useMedicionDeListado();
  const listado = useConsulta(async (senal) => {
    const alRecibir = medicion.empezar();
    const respuesta = await documentos.listar(filtros, senal);
    alRecibir(respuesta.tiempoRespuestaId);
    return respuesta;
  }, [parametros.toString()]);
  const { datos: lista } = useConsulta((senal) => categorias.listar(false, senal), []);
  // Solo el administrador elige entre su gente; un usuario filtra «los que subí yo», sin ver la lista de colegas.
  const { datos: personas } = useConsulta(
    (senal) => (esAdministrador ? usuarios.listar({ porPagina: 100 }, senal) : Promise.resolve(null)), [esAdministrador]);

  useEffect(() => {
    if (listado.datos) medicion.terminar();
  }, [listado.datos, medicion]);

  // Cambiar un filtro vuelve a la primera página.
  function aplicar(cambios: Partial<Record<Filtro | 'pagina', string | undefined>>) {
    cambiarParametros((siguientes) => {
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor) siguientes.set(clave, valor);
        else siguientes.delete(clave);
      }
      if (!('pagina' in cambios)) siguientes.delete('pagina');
    });
  }

  function limpiarFiltros() {
    setTexto('');
    cambiarParametros((siguientes) => [...siguientes.keys()].forEach((clave) => siguientes.delete(clave)));
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

  /** Quien elige una sugerencia encontró lo que buscaba: se registra la búsqueda (D42) y se abre su ficha. */
  async function elegirSugerencia(sugerencia: Sugerencia) {
    await documentos.registrarSugerencia(texto.trim(), sugerencia.id).catch(() => undefined);
    navegar(`/documentos/${sugerencia.id}`);
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

  const atajo = atajoDelRango(filtros.desde, filtros.hasta);
  const activos = filtrosActivos(filtros, {
    categoria: (id) => lista?.datos.find((categoria) => categoria.id === id)?.nombre,
    persona: (id) => (id === sesion?.usuario.id ? 'Subidos por mí' : personas?.datos.find((persona) => persona.id === id)?.nombre),
  });

  return (
    <>
      <EncabezadoDePagina
        titulo="Documentos"
        descripcion="Busca por nombre, archivo, descripción o categoría, sin preocuparte por las tildes, las mayúsculas ni el orden de las palabras."
        acciones={<>
          {esAdministrador && (
            <Boton variante="secundario" icono={FileDown} cargando={exportando} onClick={() => void exportarListado()}>Exportar listado</Boton>
          )}
          <Link to="/documentos/nuevo" className={clasesDeBoton()}><Upload aria-hidden className="size-4" />Subir documento</Link>
        </>}
      />

      <Tarjeta className="mb-4 p-4">
        <BuscadorDeDocumentos valor={texto} alCambiar={setTexto} alBuscar={buscar} alElegir={(sugerencia) => void elegirSugerencia(sugerencia)} />
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
          {/* «contents»: en pantallas anchas los campos son celdas más de la misma cuadrícula, siempre visibles. */}
          <div id="filtros-plegables" className={`${masFiltros ? 'contents' : 'hidden'} sm:contents`}>
            <Selector etiqueta="Tipo" value={filtros.tipo ?? ''} onChange={(e) => aplicar({ tipo: e.target.value || undefined })}>
              <option value="">Todos</option>
              {TIPOS_DE_ARCHIVO.map(({ valor, texto: nombre }) => <option key={valor} value={valor}>{nombre}</option>)}
            </Selector>
            <Selector etiqueta="Aprobación" value={filtros.estado ?? ''} onChange={(e) => aplicar({ estado: e.target.value || undefined })}>
              <option value="">Cualquiera</option>
              {ESTADOS_DE_APROBACION.map(({ valor, texto: nombre }) => <option key={valor} value={valor}>{nombre}</option>)}
            </Selector>
            <div className="col-span-2 sm:col-span-1">
              {esAdministrador ? (
                <Selector etiqueta="Subido por" value={filtros.subidoPor ?? ''} onChange={(e) => aplicar({ subidoPor: e.target.value || undefined })}>
                  <option value="">Cualquier persona</option>
                  {personas?.datos.map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre}</option>)}
                </Selector>
              ) : (
                <label className="flex min-h-11 items-center gap-2 pt-0 text-sm text-slate-700 sm:mt-7">
                  <input type="checkbox" className="size-4 rounded border-slate-300" checked={Boolean(filtros.subidoPor)}
                    onChange={(e) => aplicar({ subidoPor: e.target.checked ? sesion?.usuario.id : undefined })} />
                  Solo los que subí yo
                </label>
              )}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Selector etiqueta="Ordenar por" value={filtros.orden ?? (filtros.q ? 'relevancia' : 'recientes')}
                onChange={(e) => aplicar({ orden: e.target.value === (filtros.q ? 'relevancia' : 'recientes') ? undefined : e.target.value })}>
                {filtros.q && <option value="relevancia">Relevancia</option>}
                <option value="recientes">Subidos recientemente</option>
                <option value="fecha">Fecha del documento</option>
                <option value="nombre">Nombre</option>
              </Selector>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Selector etiqueta="Las fechas son" value={filtros.fechaDe ?? 'documento'}
                onChange={(e) => aplicar({ fechaDe: e.target.value === 'subida' ? 'subida' : undefined })}>
                <option value="documento">Del documento</option>
                <option value="subida">De subida al sistema</option>
              </Selector>
            </div>
            <Campo etiqueta="Desde" type="date" value={filtros.desde ?? ''} onChange={(e) => aplicar({ desde: e.target.value || undefined })} />
            <Campo etiqueta="Hasta" type="date" value={filtros.hasta ?? ''} onChange={(e) => aplicar({ hasta: e.target.value || undefined })} />
            <div role="group" aria-label="Atajos de fecha" className="col-span-2 flex flex-wrap gap-2 md:col-span-4">
              {ATAJOS_DE_FECHA.map(({ valor, texto: nombre }) => (
                <button key={valor} type="button" aria-pressed={atajo === valor} onClick={() => aplicar(rangoDeAtajo(valor))}
                  className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${atajo === valor
                    ? 'border-marca-600 bg-marca-50 font-medium text-marca-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                  {nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
        {activos.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3" aria-label="Filtros activos">
            <span className="text-sm text-slate-600">Filtrando por:</span>
            {activos.map(({ clave, texto: nombre, quitar }) => (
              <span key={clave} className="inline-flex items-center gap-1 rounded-full bg-marca-50 py-1 pr-1 pl-3 text-sm text-marca-800">
                {nombre}
                <button type="button" onClick={() => { if (clave === 'q') setTexto(''); aplicar(quitar); }} aria-label={`Quitar el filtro ${nombre}`}
                  className="flex size-7 items-center justify-center rounded-full hover:bg-marca-100">
                  <X aria-hidden className="size-4" />
                </button>
              </span>
            ))}
            <Boton variante="fantasma" tamano="pequeno" onClick={limpiarFiltros}>Limpiar filtros</Boton>
          </div>
        )}
      </Tarjeta>

      {errorAlAbrir && <div className="mb-4"><Aviso tipo="error">{errorAlAbrir.mensaje}</Aviso></div>}

      {/* scroll-mt: el encabezado fijo (h-16) no tapa el primer resultado al llevarlo a la vista. */}
      <div ref={resultados} className="scroll-mt-20" aria-busy={listado.cargando}>
        {listado.datos?.aproximada && filtros.q && (
          <div className="mb-4">
            <Aviso>No hay documentos con «{filtros.q}» tal cual. Estos se parecen: revisa si alguna palabra está mal escrita.</Aviso>
          </div>
        )}
        <Tarjeta>
          {listado.error ? (
            <div className="p-4"><ErrorDeCarga error={listado.error} alReintentar={listado.recargar} /></div>
          ) : !listado.datos ? (
            <Cargando texto="Buscando documentos…" />
          ) : listado.datos.datos.length === 0 ? (
            hayFiltros ? (
              <EstadoVacio
                icono={SearchX}
                titulo={filtros.q ? `Ningún documento coincide con «${filtros.q}»` : 'Ningún documento coincide'}
                accion={<Boton variante="secundario" onClick={limpiarFiltros}>Limpiar filtros</Boton>}
              >
                Prueba con menos palabras o con parte de una («contra» encuentra «contrato»), o quita algún filtro.
              </EstadoVacio>
            ) : (
              <EstadoVacio icono={FileText} titulo="Aún no hay documentos" accion={<Link to="/documentos/nuevo" className={clasesDeBoton()}>Subir el primero</Link>}>
                Sube un documento y aparecerá aquí, listo para encontrarlo desde cualquier dispositivo.
              </EstadoVacio>
            )
          ) : (
            <>
              <p className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm text-slate-600" aria-live="polite">
                {contar(listado.datos.paginacion.total, 'documento')}
                {listado.cargando && <span className="text-slate-500">· Buscando…</span>}
              </p>
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

interface FiltroActivo {
  clave: string;
  texto: string;
  /** Los parámetros que se borran al quitarlo. */
  quitar: Partial<Record<Filtro, undefined>>;
}

/** Los filtros en uso, en palabras, para verlos de un vistazo y quitarlos uno a uno (D42). */
export function filtrosActivos(
  filtros: FiltrosDocumentos,
  nombres: { categoria(id: string): string | undefined; persona(id: string): string | undefined },
): FiltroActivo[] {
  const activos: FiltroActivo[] = [];
  if (filtros.q) activos.push({ clave: 'q', texto: `«${filtros.q}»`, quitar: { q: undefined } });
  if (filtros.categoriaId) {
    activos.push({ clave: 'categoriaId', texto: nombres.categoria(filtros.categoriaId) ?? 'Categoría', quitar: { categoriaId: undefined } });
  }
  if (filtros.tipo) {
    activos.push({ clave: 'tipo', texto: TIPOS_DE_ARCHIVO.find((tipo) => tipo.valor === filtros.tipo)?.texto ?? filtros.tipo, quitar: { tipo: undefined } });
  }
  if (filtros.estado) {
    const estado = ESTADOS_DE_APROBACION.find((opcion) => opcion.valor === filtros.estado)?.texto ?? filtros.estado;
    activos.push({ clave: 'estado', texto: estado, quitar: { estado: undefined } });
  }
  if (filtros.subidoPor) {
    activos.push({ clave: 'subidoPor', texto: nombres.persona(filtros.subidoPor) ?? 'Una persona', quitar: { subidoPor: undefined } });
  }
  if (filtros.desde || filtros.hasta) {
    const rango = filtros.desde && filtros.hasta ? `Del ${formatearFecha(filtros.desde)} al ${formatearFecha(filtros.hasta)}`
      : filtros.desde ? `Desde el ${formatearFecha(filtros.desde)}` : `Hasta el ${formatearFecha(filtros.hasta!)}`;
    activos.push({
      clave: 'fechas',
      texto: filtros.fechaDe === 'subida' ? `${rango} (subida)` : rango,
      quitar: { desde: undefined, hasta: undefined, fechaDe: undefined },
    });
  }
  return activos;
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
          {documento.coincidencia && <Insignia>{TEXTO_DE_COINCIDENCIA[documento.coincidencia]}</Insignia>}
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
