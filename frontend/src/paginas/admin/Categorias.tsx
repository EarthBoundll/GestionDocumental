import { Pencil, Plus, Tags } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import { categorias } from '../../api/recursos';
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
        descripcion="Cómo se clasifican los documentos de tu empresa. No se borran: se desactivan, y los documentos conservan la suya."
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
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      if (categoria) await categorias.editar(categoria.id, { nombre, descripcion: descripcion || null });
      else await categorias.crear({ nombre, descripcion });
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
      </form>
    </Modal>
  );
}
