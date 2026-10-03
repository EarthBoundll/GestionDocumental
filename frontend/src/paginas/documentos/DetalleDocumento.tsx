import { ArrowLeft, Check, ClipboardCheck, Download, Eye, FileQuestion, Pencil, Trash2, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { ErrorApi } from '../../api/cliente';
import { categorias, documentos, solicitudes } from '../../api/recursos';
import type { Documento } from '../../api/tipos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton, clasesDeBoton } from '../../componentes/Boton';
import { AreaTexto, Campo, Selector } from '../../componentes/Campos';
import { InsigniaDeEstado } from '../../componentes/Insignia';
import { Modal } from '../../componentes/Modal';
import { ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { abrirArchivo } from '../../utilidades/archivos';
import { formatearFecha, formatearFechaHora, formatearPeso, nombreDeTipo } from '../../utilidades/formato';

type Dialogo = 'editar' | 'eliminar' | 'solicitar' | 'aprobar' | 'rechazar' | null;

export function DetalleDocumento() {
  const { id = '' } = useParams();
  const consulta = useConsulta((senal) => documentos.obtener(id, senal), [id]);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  if (consulta.error?.estado === 404) {
    return (
      <EstadoVacio icono={FileQuestion} titulo="Este documento no existe" accion={<Link to="/documentos" className={clasesDeBoton('secundario')}>Volver a los documentos</Link>}>
        Puede que lo hayan eliminado.
      </EstadoVacio>
    );
  }
  if (consulta.error) return <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />;
  if (!consulta.datos) return <Cargando />;

  const documento = consulta.datos;
  const { permisos } = documento;
  const terminar = (texto: string) => {
    setDialogo(null);
    setAviso({ tipo: 'exito', texto });
    consulta.recargar();
  };
  const abrir = (modo: 'ver' | 'descargar') =>
    void abrirArchivo(documento.id, modo).catch((error: ErrorApi) => setAviso({ tipo: 'error', texto: error.mensaje }));

  return (
    <>
      <Link to="/documentos" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft aria-hidden className="size-4" /> Documentos
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold break-words text-slate-900 sm:text-2xl">{documento.nombre}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>{documento.categoria.nombre}</span>
            {documento.ultimaSolicitud && <InsigniaDeEstado estado={documento.ultimaSolicitud.estado} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Boton icono={Eye} onClick={() => abrir('ver')}>Ver</Boton>
          <Boton variante="secundario" icono={Download} onClick={() => abrir('descargar')}>Descargar</Boton>
          {permisos.editar && <Boton variante="secundario" icono={Pencil} onClick={() => setDialogo('editar')}>Editar</Boton>}
          {permisos.eliminar && <Boton variante="secundario" icono={Trash2} onClick={() => setDialogo('eliminar')}>Eliminar</Boton>}
        </div>
      </div>

      {aviso && <div className="mb-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="p-4 sm:p-6 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-900">Datos del documento</h2>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Dato termino="Fecha del documento">{formatearFecha(documento.fechaDocumento)}</Dato>
            <Dato termino="Categoría">{documento.categoria.nombre}</Dato>
            <Dato termino="Subido por">{documento.subidoPor.nombre}</Dato>
            <Dato termino="Subido el">{formatearFechaHora(documento.creadoEn)}</Dato>
            <Dato termino="Archivo">
              <span className="break-all">{documento.archivo.nombreOriginal}</span>
              <span className="block text-slate-500">{nombreDeTipo(documento.archivo.tipoMime)} · {formatearPeso(documento.archivo.pesoBytes)}</span>
            </Dato>
            {documento.descripcion && <Dato termino="Descripción" ancho>{documento.descripcion}</Dato>}
          </dl>
        </Tarjeta>

        <Tarjeta className="p-4 sm:p-6">
          <h2 className="mb-4 font-semibold text-slate-900">Aprobación</h2>
          <EstadoDeAprobacion documento={documento} />
          <div className="mt-4 flex flex-wrap gap-2">
            {permisos.solicitarAprobacion && <Boton icono={ClipboardCheck} onClick={() => setDialogo('solicitar')}>Solicitar aprobación</Boton>}
            {permisos.resolverSolicitud && (
              <>
                <Boton icono={Check} onClick={() => setDialogo('aprobar')}>Aprobar</Boton>
                <Boton variante="secundario" icono={X} onClick={() => setDialogo('rechazar')}>Rechazar</Boton>
              </>
            )}
          </div>
        </Tarjeta>
      </div>

      {dialogo === 'editar' && <DialogoEditar documento={documento} alCerrar={() => setDialogo(null)} alGuardar={() => terminar('Los cambios se guardaron.')} />}
      {dialogo === 'eliminar' && <DialogoEliminar documento={documento} alCerrar={() => setDialogo(null)} />}
      {dialogo === 'solicitar' && <DialogoComentario
        titulo="Solicitar aprobación"
        explicacion="Los administradores de tu empresa recibirán un aviso para aprobarlo o rechazarlo."
        etiqueta="Comentario para quien lo revise"
        boton="Enviar solicitud"
        alCerrar={() => setDialogo(null)}
        alEnviar={(comentario) => documentos.solicitarAprobacion(documento.id, comentario)}
        alTerminar={() => terminar('La solicitud se envió a los administradores.')}
      />}
      {(dialogo === 'aprobar' || dialogo === 'rechazar') && documento.ultimaSolicitud && <DialogoComentario
        titulo={dialogo === 'aprobar' ? 'Aprobar el documento' : 'Rechazar el documento'}
        explicacion={`${documento.ultimaSolicitud.solicitante.nombre} recibirá un aviso con tu decisión.`}
        etiqueta={dialogo === 'aprobar' ? 'Comentario' : 'Motivo del rechazo'}
        obligatorio={dialogo === 'rechazar'}
        boton={dialogo === 'aprobar' ? 'Aprobar' : 'Rechazar'}
        variante={dialogo === 'aprobar' ? 'primario' : 'peligro'}
        alCerrar={() => setDialogo(null)}
        alEnviar={(comentario) => solicitudes.resolver(documento.ultimaSolicitud!.id, dialogo === 'aprobar' ? 'aprobada' : 'rechazada', comentario)}
        alTerminar={() => terminar(dialogo === 'aprobar' ? 'Aprobaste el documento.' : 'Rechazaste el documento.')}
      />}
    </>
  );
}

function Dato({ termino, children, ancho = false }: { termino: string; children: ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{termino}</dt>
      <dd className="mt-1 text-sm whitespace-pre-line text-slate-900">{children}</dd>
    </div>
  );
}

function EstadoDeAprobacion({ documento }: { documento: Documento }) {
  const solicitud = documento.ultimaSolicitud;
  if (!solicitud) return <p className="text-sm text-slate-600">Nadie ha pedido aprobar este documento.</p>;
  return (
    <div className="space-y-3 text-sm">
      <InsigniaDeEstado estado={solicitud.estado} />
      <p className="text-slate-700">
        Solicitado por <span className="font-medium">{solicitud.solicitante.nombre}</span> el {formatearFechaHora(solicitud.creadaEn)}
      </p>
      {solicitud.comentarioSolicitud && <blockquote className="border-l-2 border-slate-300 pl-3 text-slate-600">{solicitud.comentarioSolicitud}</blockquote>}
      {solicitud.revisor && solicitud.resueltaEn && (
        <p className="text-slate-700">
          {solicitud.estado === 'aprobada' ? 'Aprobado' : 'Rechazado'} por <span className="font-medium">{solicitud.revisor.nombre}</span> el {formatearFechaHora(solicitud.resueltaEn)}
        </p>
      )}
      {solicitud.comentarioResolucion && <blockquote className="border-l-2 border-slate-300 pl-3 text-slate-600">{solicitud.comentarioResolucion}</blockquote>}
    </div>
  );
}

function DialogoEditar({ documento, alCerrar, alGuardar }: { documento: Documento; alCerrar(): void; alGuardar(): void }) {
  const { datos: lista } = useConsulta((senal) => categorias.listar(false, senal), []);
  const [valores, setValores] = useState({
    nombre: documento.nombre,
    categoriaId: documento.categoria.id,
    fechaDocumento: documento.fechaDocumento,
    descripcion: documento.descripcion ?? '',
  });
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof valores) => (evento: { target: { value: string } }) =>
    setValores((anteriores) => ({ ...anteriores, [campo]: evento.target.value }));

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      await documentos.editar(documento.id, { ...valores, descripcion: valores.descripcion || null });
      alGuardar();
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  // La categoría actual se ofrece aunque esté desactivada: conservarla es válido, asignarla de nuevo no.
  const opciones = lista?.datos.some((c) => c.id === documento.categoria.id) ? lista.datos : [...(lista?.datos ?? []), { ...documento.categoria }];
  const errores = error?.porCampo() ?? {};
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Editar documento"
      acciones={<>
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton type="submit" form="editar-documento" cargando={enviando}>Guardar cambios</Boton>
      </>}
    >
      <form id="editar-documento" onSubmit={(evento) => void guardar(evento)} className="space-y-4" noValidate>
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Campo etiqueta="Nombre" value={valores.nombre} onChange={cambiar('nombre')} error={errores.nombre} />
        <Selector etiqueta="Categoría" value={valores.categoriaId} onChange={cambiar('categoriaId')} error={errores.categoriaId}>
          {opciones.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
        </Selector>
        <Campo etiqueta="Fecha del documento" type="date" value={valores.fechaDocumento} onChange={cambiar('fechaDocumento')} error={errores.fechaDocumento} />
        <AreaTexto etiqueta="Descripción" opcional value={valores.descripcion} onChange={cambiar('descripcion')} error={errores.descripcion} />
      </form>
    </Modal>
  );
}

function DialogoEliminar({ documento, alCerrar }: { documento: Documento; alCerrar(): void }) {
  const navegar = useNavigate();
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function eliminar() {
    setEnviando(true);
    try {
      await documentos.eliminar(documento.id);
      navegar('/documentos', { replace: true });
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Eliminar documento"
      acciones={<>
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton variante="peligro" cargando={enviando} onClick={() => void eliminar()}>Eliminar</Boton>
      </>}
    >
      {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
      <p className="text-sm text-slate-700">
        «{documento.nombre}» dejará de aparecer en las búsquedas. Queda constancia en el historial de quién lo eliminó y cuándo.
      </p>
    </Modal>
  );
}

function DialogoComentario({ titulo, explicacion, etiqueta, boton, obligatorio = false, variante = 'primario', alCerrar, alEnviar, alTerminar }: {
  titulo: string;
  explicacion: string;
  etiqueta: string;
  boton: string;
  obligatorio?: boolean;
  variante?: 'primario' | 'peligro';
  alCerrar(): void;
  alEnviar(comentario: string): Promise<unknown>;
  alTerminar(): void;
}) {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      await alEnviar(comentario);
      alTerminar();
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={titulo}
      acciones={<>
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton type="submit" form="dialogo-comentario" variante={variante} cargando={enviando}>{boton}</Boton>
      </>}
    >
      <form id="dialogo-comentario" onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <p className="text-sm text-slate-700">{explicacion}</p>
        <AreaTexto etiqueta={etiqueta} opcional={!obligatorio} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)} error={error?.porCampo().comentario} />
      </form>
    </Modal>
  );
}
