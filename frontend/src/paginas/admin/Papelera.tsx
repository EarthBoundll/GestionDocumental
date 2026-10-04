import { RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { ErrorApi } from '../../api/cliente';
import { documentos } from '../../api/recursos';
import type { DocumentoEnPapelera } from '../../api/tipos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Modal } from '../../componentes/Modal';
import { EncabezadoDePagina, ErrorDeCarga, Paginacion, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { contar, formatearFechaHora, formatearPeso } from '../../utilidades/formato';

const DIA_MS = 24 * 60 * 60 * 1000;

/** RF26: lo eliminado espera aquí su plazo. Un administrador lo restaura o lo elimina para siempre. */
export function Papelera() {
  const [parametros, setParametros] = useSearchParams();
  const pagina = Number(parametros.get('pagina') ?? 1);
  const consulta = useConsulta((senal) => documentos.papelera({ pagina }, senal), [pagina]);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [purgando, setPurgando] = useState<DocumentoEnPapelera | null>(null);
  const [restaurando, setRestaurando] = useState<string | null>(null);

  async function restaurar(documento: DocumentoEnPapelera) {
    setAviso(null);
    setRestaurando(documento.id);
    try {
      await documentos.restaurar(documento.id);
      setAviso({ tipo: 'exito', texto: `«${documento.nombre}» vuelve a estar entre los documentos, tal como estaba.` });
      consulta.recargar();
    } catch (error) {
      setAviso({ tipo: 'error', texto: (error as ErrorApi).mensaje });
    }
    setRestaurando(null);
  }

  if (consulta.error) return <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />;
  const dias = consulta.datos?.diasEnPapelera ?? 30;
  return (
    <>
      <EncabezadoDePagina
        titulo="Papelera"
        descripcion={`Lo que se elimina espera aquí ${dias} días antes de borrarse para siempre. Mientras tanto puedes restaurarlo.`}
      />
      {aviso && <div className="mb-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}
      <Tarjeta>
        {!consulta.datos ? (
          <Cargando />
        ) : consulta.datos.datos.length === 0 ? (
          <EstadoVacio icono={Trash2} titulo="La papelera está vacía">Los documentos eliminados aparecerán aquí.</EstadoVacio>
        ) : (
          <ul className="divide-y divide-slate-100">
            {consulta.datos.datos.map((documento) => (
              <li key={documento.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{documento.nombre}</p>
                  <p className="text-sm text-slate-500">
                    {documento.categoria.nombre} · {formatearPeso(documento.archivo.pesoBytes)} · eliminado
                    {documento.eliminadoPor && <> por {documento.eliminadoPor.nombre}</>} el {formatearFechaHora(documento.eliminadoEn)}
                  </p>
                  <p className="text-xs text-amber-700">{plazo(documento.purgaEn)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Boton variante="secundario" tamano="pequeno" icono={RotateCcw} cargando={restaurando === documento.id}
                    onClick={() => void restaurar(documento)}>Restaurar</Boton>
                  <Boton variante="fantasma" tamano="pequeno" icono={Trash2} onClick={() => setPurgando(documento)}>Eliminar para siempre</Boton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {consulta.datos && (
        <Paginacion {...consulta.datos.paginacion} alCambiar={(siguiente) => setParametros({ pagina: String(siguiente) })} />
      )}
      {purgando && (
        <DialogoPurgar
          documento={purgando}
          alCerrar={() => setPurgando(null)}
          alPurgar={() => {
            setAviso({ tipo: 'exito', texto: `«${purgando.nombre}» se eliminó para siempre.` });
            setPurgando(null);
            consulta.recargar();
          }}
        />
      )}
    </>
  );
}

function plazo(purgaEn: string): string {
  const restantes = Math.ceil((Date.parse(purgaEn) - Date.now()) / DIA_MS);
  return restantes <= 0 ? 'Se borrará en las próximas horas' : `Se borrará en ${contar(restantes, 'día')}`;
}

function DialogoPurgar({ documento, alCerrar, alPurgar }: { documento: DocumentoEnPapelera; alCerrar(): void; alPurgar(): void }) {
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function purgar() {
    setEnviando(true);
    try {
      await documentos.purgar(documento.id);
      alPurgar();
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Eliminar para siempre"
      acciones={<>
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton variante="peligro" cargando={enviando} onClick={() => void purgar()}>Eliminar para siempre</Boton>
      </>}
    >
      {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
      <p className="text-sm text-slate-700">
        El archivo de «{documento.nombre}» se borrará y no se podrá recuperar. En el historial quedará constancia de quién lo hizo y cuándo.
      </p>
    </Modal>
  );
}
