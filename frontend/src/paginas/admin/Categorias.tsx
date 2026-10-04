import { Lock, Pencil, Plus, Tags } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import { categorias, usuarios } from '../../api/recursos';
import type { Categoria } from '../../api/tipos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { AreaTexto, Campo } from '../../componentes/Campos';
import { Insignia } from '../../componentes/Insignia';
import { Modal } from '../../componentes/Modal';
import { EncabezadoDePagina, ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { contar } from '../../utilidades/formato';

export function Categorias() {
  const consulta = useConsulta((senal) => categorias.listar(true, senal), []);
  const [editando, setEditando] = useState<Categoria | 'nueva' | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  async function alternar(categoria: Categoria) {
    setAviso(null);
    try {
      await categorias.editar(categoria.id, { activa: !categoria.activa });
      setAviso({ tipo: 'exito', texto: categoria.activa
        ? `«${categoria.nombre}» ya no se ofrece para documentos nuevos; los que la tienen la conservan.`
        : `«${categoria.nombre}» vuelve a estar disponible.` });
      consulta.recargar();
    } catch (error) {
      setAviso({ tipo: 'error', texto: (error as ErrorApi).mensaje });
    }
  }

  if (consulta.error) return <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />;
  return (
    <>
      <EncabezadoDePagina
        titulo="Categorías"
        descripcion="Cómo se clasifican los documentos de tu empresa. No se borran: se desactivan, y los documentos conservan la suya. Una categoría restringida solo la ven los administradores y las personas que elijas."
        acciones={<Boton icono={Plus} onClick={() => setEditando('nueva')}>Nueva categoría</Boton>}
      />
      {aviso && <div className="mb-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}
      <Tarjeta>
        {!consulta.datos ? (
          <Cargando />
        ) : consulta.datos.datos.length === 0 ? (
          <EstadoVacio icono={Tags} titulo="Aún no hay categorías" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {consulta.datos.datos.map((categoria) => (
              <li key={categoria.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${categoria.activa ? 'text-slate-900' : 'text-slate-400'}`}>{categoria.nombre}</p>
                  {categoria.descripcion && <p className="text-sm text-slate-500">{categoria.descripcion}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">{contar(categoria.documentos, 'documento')}</span>
                  {categoria.restringida && (
                    <Insignia tono="advertencia">
                      <Lock className="mr-1 size-3" aria-hidden />
                      Restringida · {contar(categoria.usuariosAutorizados.length, 'persona')}
                    </Insignia>
                  )}
                  {!categoria.activa && <Insignia tono="neutro">Desactivada</Insignia>}
                  <Boton variante="fantasma" tamano="pequeno" icono={Pencil} onClick={() => setEditando(categoria)}>Editar</Boton>
                  <Boton variante="secundario" tamano="pequeno" onClick={() => void alternar(categoria)}>{categoria.activa ? 'Desactivar' : 'Reactivar'}</Boton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      {editando && (
        <DialogoCategoria
          categoria={editando === 'nueva' ? null : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={(texto) => { setEditando(null); setAviso({ tipo: 'exito', texto }); consulta.recargar(); }}
        />
      )}
    </>
  );
}

function DialogoCategoria({ categoria, alCerrar, alGuardar }: { categoria: Categoria | null; alCerrar(): void; alGuardar(texto: string): void }) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(categoria?.descripcion ?? '');
  const [restringida, setRestringida] = useState(categoria?.restringida ?? false);
  const [autorizados, setAutorizados] = useState<string[]>(categoria?.usuariosAutorizados ?? []);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    const acceso = { restringida, ...(restringida && { usuariosAutorizados: autorizados }) };
    try {
      if (categoria) await categorias.editar(categoria.id, { nombre, descripcion: descripcion || null, ...acceso });
      else await categorias.crear({ nombre, descripcion, ...acceso });
      alGuardar(categoria ? 'Cambios guardados.' : `La categoría «${nombre.trim()}» está lista para usarse.`);
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
      titulo={categoria ? 'Editar categoría' : 'Nueva categoría'}
      acciones={<>
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton type="submit" form="dialogo-categoria" cargando={enviando}>Guardar</Boton>
      </>}
    >
      <form id="dialogo-categoria" onSubmit={(evento) => void guardar(evento)} className="space-y-4" noValidate>
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} />
        <AreaTexto etiqueta="Descripción" opcional maxLength={255} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} error={errores.descripcion}
          ayuda="Para que todos sepan qué va aquí: «Facturas de proveedores, no de clientes»." />
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input type="checkbox" className="mt-0.5 size-4" checked={restringida} onChange={(e) => setRestringida(e.target.checked)} />
          <span>
            <span className="block text-sm font-medium text-slate-900">Restringir a personas concretas</span>
            <span className="block text-xs text-slate-500">
              Para documentos confidenciales, como planillas o contratos laborales. Los administradores siempre la ven.
            </span>
          </span>
        </label>
        {restringida && <SelectorDePersonas seleccionadas={autorizados} alCambiar={setAutorizados} error={errores.usuariosAutorizados} />}
      </form>
    </Modal>
  );
}

/** Las personas (no administradoras) que pueden ver una categoría restringida. */
function SelectorDePersonas({ seleccionadas, alCambiar, error }: { seleccionadas: string[]; alCambiar(ids: string[]): void; error?: string | undefined }) {
  const consulta = useConsulta((senal) => usuarios.listar({ rol: 'usuario', activo: true, porPagina: 100 }, senal), []);
  const alternar = (id: string, marcada: boolean) =>
    alCambiar(marcada ? [...seleccionadas, id] : seleccionadas.filter((otro) => otro !== id));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-700">Quiénes pueden verla</legend>
      {consulta.error ? (
        <Aviso tipo="error">{consulta.error.mensaje}</Aviso>
      ) : !consulta.datos ? (
        <Cargando texto="Cargando personas…" />
      ) : consulta.datos.datos.length === 0 ? (
        <p className="text-sm text-slate-500">Tu empresa aún no tiene usuarios: por ahora solo la verán los administradores.</p>
      ) : (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {consulta.datos.datos.map((persona) => (
            <li key={persona.id}>
              <label className="flex items-center gap-3 px-3 py-2">
                <input type="checkbox" className="size-4" checked={seleccionadas.includes(persona.id)}
                  onChange={(e) => alternar(persona.id, e.target.checked)} />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-900">{persona.nombre}</span>
                  <span className="block truncate text-xs text-slate-500">{persona.email}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </fieldset>
  );
}
