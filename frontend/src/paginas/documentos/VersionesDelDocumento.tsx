import { Download, Eye, FileUp, RotateCcw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import { documentos } from '../../api/recursos';
import type { Documento, Version } from '../../api/tipos';
import { Aviso, Cargando } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { AreaTexto } from '../../componentes/Campos';
import { Insignia } from '../../componentes/Insignia';
import { Modal } from '../../componentes/Modal';
import { ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { abrirArchivo, EXTENSIONES, problemaConArchivo } from '../../utilidades/archivos';
import { formatearFechaHora, formatearPeso, nombreDeTipo } from '../../utilidades/formato';

interface Props {
  documento: Documento;
  /** Tras subir o restaurar: la ficha se vuelve a pedir, con su nueva versión vigente y su actividad. */
  alCambiar(texto: string): void;
  alFallar(texto: string): void;
  /** Ver o descargar una versión deja un paso en la actividad. */
  alConsultar(): void;
}

/**
 * RF34: las versiones del documento. Ninguna se borra: una versión nueva se suma, y restaurar copia una
 * anterior como la siguiente (D30). Sube versiones quien puede editarlo, y no con una aprobación pendiente.
 */
export function VersionesDelDocumento({ documento, alCambiar, alFallar, alConsultar }: Props) {
  const consulta = useConsulta((senal) => documentos.versiones(documento.id, senal), [documento.id, documento.version]);
  const [subiendo, setSubiendo] = useState(false);
  const [restaurando, setRestaurando] = useState<number | null>(null);
  const { versionar } = documento.permisos;
  const pendiente = documento.ultimaSolicitud?.estado === 'pendiente';

  const abrir = (numero: number, modo: 'ver' | 'descargar') =>
    void abrirArchivo(documento.id, modo, numero).then(alConsultar).catch((error: ErrorApi) => alFallar(error.mensaje));

  async function restaurar(numero: number) {
    setRestaurando(numero);
    try {
      const actualizado = await documentos.restaurarVersion(documento.id, numero);
      alCambiar(`La versión ${numero} se restauró como versión ${actualizado.version}. Las demás siguen guardadas.`);
    } catch (error) {
      alFallar((error as ErrorApi).mensaje);
    } finally {
      setRestaurando(null);
    }
  }

  return (
    <Tarjeta className="mt-4 p-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Versiones</h2>
        {versionar && <Boton variante="secundario" tamano="pequeno" icono={FileUp} onClick={() => setSubiendo(true)}>Subir versión nueva</Boton>}
      </div>
      <p className="mb-4 text-sm text-slate-600">
        {pendiente
          ? 'Mientras se revisa la aprobación, no se suben ni se restauran versiones: se aprobaría un archivo distinto del revisado.'
          : 'Ninguna se borra. Restaurar una anterior la copia como versión nueva, así que la historia queda entera.'}
      </p>
      {consulta.error ? (
        <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />
      ) : !consulta.datos ? (
        <Cargando />
      ) : (
        <ol className="divide-y divide-slate-100" aria-label="Versiones del documento">
          {consulta.datos.datos.map((version) => (
            <FilaDeVersion
              key={version.numero}
              version={version}
              alAbrir={(modo) => abrir(version.numero, modo)}
              alRestaurar={versionar && !version.vigente ? () => void restaurar(version.numero) : undefined}
              restaurando={restaurando === version.numero}
            />
          ))}
        </ol>
      )}
      {subiendo && (
        <DialogoNuevaVersion
          documento={documento}
          alCerrar={() => setSubiendo(false)}
          alSubir={(actualizado) => {
            setSubiendo(false);
            alCambiar(`Se subió la versión ${actualizado.version}. La anterior sigue guardada.`);
          }}
        />
      )}
    </Tarjeta>
  );
}

function FilaDeVersion({ version, alAbrir, alRestaurar, restaurando }: {
  version: Version;
  alAbrir(modo: 'ver' | 'descargar'): void;
  alRestaurar: (() => void) | undefined;
  restaurando: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-slate-900">Versión {version.numero}</span>
          {version.vigente && <Insignia tono="marca">Vigente</Insignia>}
          {version.restauradaDe && <Insignia>Copia de la versión {version.restauradaDe}</Insignia>}
        </p>
        <p className="mt-0.5 text-sm break-all text-slate-600">
          {version.archivo.nombreOriginal} · {nombreDeTipo(version.archivo.tipoMime)} · {formatearPeso(version.archivo.pesoBytes)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {version.subidaPor.nombre} · <time dateTime={version.creadaEn}>{formatearFechaHora(version.creadaEn)}</time>
        </p>
        {version.comentario && <p className="mt-1 text-sm break-words text-slate-700">«{version.comentario}»</p>}
      </div>
      {/* La vigente se ve y descarga con los botones de arriba; aquí, las anteriores. */}
      {!version.vigente && (
        <div className="flex shrink-0 flex-wrap gap-1">
          <Boton variante="fantasma" tamano="pequeno" icono={Eye} onClick={() => alAbrir('ver')} aria-label={`Ver la versión ${version.numero}`}>Ver</Boton>
          <Boton variante="fantasma" tamano="pequeno" icono={Download} onClick={() => alAbrir('descargar')} aria-label={`Descargar la versión ${version.numero}`}>Descargar</Boton>
          {alRestaurar && (
            <Boton variante="secundario" tamano="pequeno" icono={RotateCcw} cargando={restaurando} onClick={alRestaurar}
              aria-label={`Restaurar la versión ${version.numero}`}>Restaurar</Boton>
          )}
        </div>
      )}
    </li>
  );
}

function DialogoNuevaVersion({ documento, alCerrar, alSubir }: { documento: Documento; alCerrar(): void; alSubir(documento: Documento): void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  function elegir(elegido: File | undefined) {
    if (!elegido) return;
    const problema = problemaConArchivo(elegido);
    setError(problema ? new ErrorApi(400, 'VALIDACION', problema, [{ campo: 'archivo', mensaje: problema }]) : null);
    setArchivo(problema ? null : elegido);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!archivo) {
      setError(new ErrorApi(400, 'VALIDACION', 'Elige el archivo', [{ campo: 'archivo', mensaje: 'Elige el archivo de la versión nueva' }]));
      return;
    }
    const formulario = new FormData();
    formulario.append('archivo', archivo);
    if (comentario.trim()) formulario.append('comentario', comentario.trim());
    setEnviando(true);
    try {
      alSubir(await documentos.subirVersion(documento.id, formulario));
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Subir versión nueva"
      acciones={<>
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton type="submit" form="nueva-version" icono={FileUp} cargando={enviando}>Subir versión {documento.version + 1}</Boton>
      </>}
    >
      <form id="nueva-version" onSubmit={(evento) => void enviar(evento)} className="space-y-4" noValidate>
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <p className="text-sm text-slate-700">
          Pasará a ser la versión vigente de «{documento.nombre}»: la que se ve, se busca y se descarga. La versión {documento.version} queda guardada.
        </p>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="archivo-version">Archivo</label>
          <input
            id="archivo-version"
            type="file"
            accept={EXTENSIONES.map((extension) => `.${extension}`).join(',')}
            aria-invalid={Boolean(errores.archivo)}
            onChange={(evento) => elegir(evento.target.files?.[0])}
            className="block w-full text-sm text-slate-700 file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
          />
          {archivo && <p className="text-xs text-slate-500">{archivo.name} · {formatearPeso(archivo.size)}</p>}
          {errores.archivo && <p className="text-sm text-red-700">{errores.archivo}</p>}
        </div>
        <AreaTexto etiqueta="Qué cambió" opcional maxLength={500} value={comentario} onChange={(evento) => setComentario(evento.target.value)}
          ayuda="Por ejemplo: «Corrige el monto de la cláusula 4». Lo verán todos en la ficha." error={errores.comentario} />
      </form>
    </Modal>
  );
}

