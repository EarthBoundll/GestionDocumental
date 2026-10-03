import { FileUp, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { categorias, documentos } from '../../api/recursos';
import type { Documento } from '../../api/tipos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { AreaTexto, Campo, Selector } from '../../componentes/Campos';
import { EncabezadoDePagina, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { EXTENSIONES, problemaConArchivo } from '../../utilidades/archivos';
import { formatearPeso, hoyEnLima, nombreSugerido } from '../../utilidades/formato';

export function SubirDocumento() {
  const { datos: lista } = useConsulta((senal) => categorias.listar(false, senal), []);
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState('');
  const [nombreTocado, setNombreTocado] = useState(false);
  const [categoriaId, setCategoriaId] = useState('');
  const [fechaDocumento, setFechaDocumento] = useState(hoyEnLima);
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<ErrorApi | null>(null);
  const [subido, setSubido] = useState<Documento | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const resultado = useRef<HTMLDivElement>(null);

  // En un celular el botón queda al final del formulario y el aviso arriba: se lleva a la vista y recibe
  // el foco, para que quien sube sepa qué pasó (y un lector de pantalla lo anuncie).
  useEffect(() => {
    if (!subido && !error?.mensaje) return;
    if (error?.detalles.length) return;
    const sinAnimaciones = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    resultado.current?.scrollIntoView({ behavior: sinAnimaciones ? 'auto' : 'smooth', block: 'center' });
    resultado.current?.focus({ preventScroll: true });
  }, [subido, error]);

  function elegir(elegido: File | undefined) {
    if (!elegido) return;
    const problema = problemaConArchivo(elegido);
    setError(problema ? new ErrorApi(400, 'VALIDACION', problema, [{ campo: 'archivo', mensaje: problema }]) : null);
    setArchivo(problema ? null : elegido);
    if (!problema && !nombreTocado) setNombre(nombreSugerido(elegido.name));
  }

  function soltar(evento: DragEvent) {
    evento.preventDefault();
    setArrastrando(false);
    elegir(evento.dataTransfer.files[0]);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!archivo) {
      setError(new ErrorApi(400, 'VALIDACION', 'Adjunta el archivo', [{ campo: 'archivo', mensaje: 'Elige el archivo del documento' }]));
      return;
    }
    const formulario = new FormData();
    formulario.set('nombre', nombre);
    formulario.set('categoriaId', categoriaId);
    formulario.set('fechaDocumento', fechaDocumento);
    formulario.set('descripcion', descripcion);
    formulario.set('archivo', archivo);
    setEnviando(true);
    setError(null);
    try {
      setSubido(await documentos.subir(formulario));
      // Listo para el siguiente: se conservan la categoría y la fecha, que en un lote suelen repetirse.
      setArchivo(null);
      setNombre('');
      setNombreTocado(false);
      setDescripcion('');
      if (entradaArchivo.current) entradaArchivo.current.value = '';
    } catch (causa) {
      setError(causa as ErrorApi);
    } finally {
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <>
      <EncabezadoDePagina titulo="Subir documento" descripcion={`PDF, imágenes, Word o Excel, hasta 10 MB.`} />

      {subido && (
        <div ref={resultado} tabIndex={-1} className="mb-4 outline-none">
          <Aviso tipo="exito" accion={<Link to={`/documentos/${subido.id}`} className="font-medium underline">Ver documento</Link>}>
            «{subido.nombre}» se subió correctamente. Puedes subir el siguiente.
          </Aviso>
        </div>
      )}

      <Tarjeta className="p-4 sm:p-6">
        <form onSubmit={(evento) => void enviar(evento)} noValidate>
          {/* Mientras sube, nada se puede tocar: al terminar se vacía el formulario y se perdería lo elegido. */}
          <fieldset disabled={enviando} className="min-w-0 space-y-5">
            {error && !error.detalles.length && <div ref={resultado} tabIndex={-1} className="outline-none"><Aviso tipo="error">{error.mensaje}</Aviso></div>}

            <div>
              <label
                onDragOver={(evento) => { evento.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={soltar}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  arrastrando ? 'border-marca-500 bg-marca-50' : errores.archivo ? 'border-red-400 bg-red-50/40' : 'border-slate-300 hover:border-marca-500 hover:bg-slate-50'
                }`}
              >
                <FileUp aria-hidden className="size-8 text-slate-400" />
                {archivo ? (
                  <span className="text-sm">
                    <span className="font-medium text-slate-900">{archivo.name}</span>
                    <span className="text-slate-500"> · {formatearPeso(archivo.size)} · Toca para cambiarlo</span>
                  </span>
                ) : (
                  <span className="text-sm text-slate-600">
                    <span className="font-medium text-marca-700">Elige el archivo</span> o arrástralo aquí
                  </span>
                )}
                <input
                  ref={entradaArchivo}
                  type="file"
                  className="sr-only"
                  accept={EXTENSIONES.map((extension) => `.${extension}`).join(',')}
                  aria-invalid={Boolean(errores.archivo)}
                  aria-label="Archivo del documento"
                  onChange={(evento) => elegir(evento.target.files?.[0])}
                />
              </label>
              {errores.archivo && <p className="mt-1.5 text-sm text-red-700">{errores.archivo}</p>}
            </div>

            <Campo
              etiqueta="Nombre del documento"
              required
              ayuda="Es lo que se busca después: mejor «Contrato de alquiler del local» que «scan0012»."
              value={nombre}
              onChange={(e) => { setNombre(e.target.value); setNombreTocado(true); }}
              error={errores.nombre}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Selector etiqueta="Categoría" required value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} error={errores.categoriaId}>
                <option value="">Elige una categoría</option>
                {lista?.datos.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
              </Selector>
              <Campo etiqueta="Fecha del documento" type="date" required value={fechaDocumento} onChange={(e) => setFechaDocumento(e.target.value)} error={errores.fechaDocumento} ayuda="La de emisión o firma. Por defecto, hoy." />
            </div>
            <AreaTexto etiqueta="Descripción" opcional maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} error={errores.descripcion} />

            <div className="flex justify-end">
              <Boton type="submit" icono={Upload} cargando={enviando} className="w-full sm:w-auto">Subir documento</Boton>
            </div>
          </fieldset>
        </form>
      </Tarjeta>
    </>
  );
}
