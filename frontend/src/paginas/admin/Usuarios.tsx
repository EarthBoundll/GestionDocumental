import { Pencil, Search, UserPlus, Users as IconoUsuarios } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import { usuarios } from '../../api/recursos';
import type { RolDeEmpresa, Usuario } from '../../api/tipos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo, Selector } from '../../componentes/Campos';
import { Insignia } from '../../componentes/Insignia';
import { Modal } from '../../componentes/Modal';
import { EncabezadoDePagina, ErrorDeCarga, Paginacion, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { useSesion } from '../../sesion/SesionContext';

export function Usuarios() {
  const { sesion } = useSesion();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const consulta = useConsulta((senal) => usuarios.listar({ q: busqueda || undefined, pagina }, senal), [busqueda, pagina]);

  async function cambiarEstado(usuario: Usuario) {
    setAviso(null);
    try {
      await usuarios.cambiarEstado(usuario.id, !usuario.activo);
      setAviso({ tipo: 'exito', texto: usuario.activo ? `${usuario.nombre} ya no puede entrar; sus sesiones se cerraron.` : `${usuario.nombre} puede volver a entrar.` });
      consulta.recargar();
    } catch (error) {
      setAviso({ tipo: 'error', texto: (error as ErrorApi).mensaje });
    }
  }

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    setPagina(1);
    setBusqueda(texto.trim());
  }

  if (consulta.error?.estado === 403) return <ErrorDeCarga error={consulta.error} />;
  return (
    <>
      <EncabezadoDePagina
        titulo="Usuarios"
        descripcion="Las personas de tu empresa que pueden entrar al sistema."
        acciones={<Boton icono={UserPlus} onClick={() => setEditando('nuevo')}>Nuevo usuario</Boton>}
      />
      {aviso && <div className="mb-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}

      <Tarjeta>
        <form role="search" onSubmit={buscar} className="flex gap-2 border-b border-slate-200 p-4">
          <div className="flex-1"><Campo etiqueta="Buscar por nombre o correo" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} /></div>
          <Boton type="submit" variante="secundario" icono={Search} className="mt-7 self-start" aria-label="Buscar"><span className="hidden sm:inline">Buscar</span></Boton>
        </form>
        {consulta.error ? (
          <div className="p-4"><ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} /></div>
        ) : !consulta.datos ? (
          <Cargando />
        ) : consulta.datos.datos.length === 0 ? (
          <EstadoVacio icono={IconoUsuarios} titulo="Nadie coincide con la búsqueda" />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {consulta.datos.datos.map((usuario) => {
                const esUnoMismo = usuario.id === sesion?.usuario.id;
                return (
                  <li key={usuario.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${usuario.activo ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                        {usuario.nombre}{esUnoMismo && <span className="font-normal text-slate-500"> (tú)</span>}
                      </p>
                      <p className="truncate text-sm text-slate-500">{usuario.email}{usuario.dni && ` · DNI ${usuario.dni}`}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Insignia tono={usuario.rol === 'administrador' ? 'marca' : 'neutro'}>{usuario.rol === 'administrador' ? 'Administrador' : 'Usuario'}</Insignia>
                      {!usuario.activo && <Insignia tono="peligro">Desactivado</Insignia>}
                      <Boton variante="fantasma" tamano="pequeno" icono={Pencil} onClick={() => setEditando(usuario)}>Editar</Boton>
                      {/* RN03: nadie se desactiva a sí mismo. La API también lo impide; aquí solo se evita ofrecerlo. */}
                      {!esUnoMismo && (
                        <Boton variante="secundario" tamano="pequeno" onClick={() => void cambiarEstado(usuario)}>
                          {usuario.activo ? 'Desactivar' : 'Reactivar'}
                        </Boton>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <Paginacion {...consulta.datos.paginacion} alCambiar={setPagina} />
          </>
        )}
      </Tarjeta>

      {editando && (
        <DialogoUsuario
          usuario={editando === 'nuevo' ? null : editando}
          esUnoMismo={editando !== 'nuevo' && editando.id === sesion?.usuario.id}
          alCerrar={() => setEditando(null)}
          alGuardar={(texto) => { setEditando(null); setAviso({ tipo: 'exito', texto }); consulta.recargar(); }}
        />
      )}
    </>
  );
}

function DialogoUsuario({ usuario, esUnoMismo, alCerrar, alGuardar }: { usuario: Usuario | null; esUnoMismo: boolean; alCerrar(): void; alGuardar(texto: string): void }) {
  const [valores, setValores] = useState({
    nombre: usuario?.nombre ?? '', email: usuario?.email ?? '', dni: usuario?.dni ?? '', rol: usuario?.rol ?? 'usuario' as RolDeEmpresa, clave: '',
  });
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof valores) => (evento: { target: { value: string } }) =>
    setValores((anteriores) => ({ ...anteriores, [campo]: evento.target.value }));

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      if (usuario) {
        await usuarios.editar(usuario.id, {
          nombre: valores.nombre,
          dni: valores.dni,
          ...(!esUnoMismo && { rol: valores.rol }),
          ...(valores.clave && { clave: valores.clave }),
        });
        alGuardar(valores.clave ? 'Cambios guardados. Con la contraseña nueva, sus sesiones abiertas se cerraron.' : 'Cambios guardados.');
      } else {
        await usuarios.crear(valores);
        alGuardar(`${valores.nombre} ya puede entrar con su correo y la contraseña que le diste.`);
      }
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
      titulo={usuario ? 'Editar usuario' : 'Nuevo usuario'}
      acciones={<>
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton type="submit" form="dialogo-usuario" cargando={enviando}>{usuario ? 'Guardar cambios' : 'Crear usuario'}</Boton>
      </>}
    >
      <form id="dialogo-usuario" onSubmit={(evento) => void guardar(evento)} className="space-y-4" noValidate>
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Campo etiqueta="Nombre" value={valores.nombre} onChange={cambiar('nombre')} error={errores.nombre} />
        <Campo etiqueta="Correo" type="email" disabled={Boolean(usuario)} value={valores.email} onChange={cambiar('email')} error={errores.email}
          ayuda={usuario ? 'El correo es su usuario de acceso y no se cambia.' : undefined} />
        <Campo etiqueta="DNI" opcional inputMode="numeric" maxLength={8} value={valores.dni} onChange={cambiar('dni')} error={errores.dni}
          ayuda="Es un dato de su perfil; no sirve para entrar." />
        <Selector etiqueta="Rol" disabled={esUnoMismo} value={valores.rol} onChange={cambiar('rol')} error={errores.rol}
          ayuda={esUnoMismo ? 'Tu propio rol lo cambia otro administrador.' : 'El administrador gestiona usuarios y categorías, resuelve solicitudes y consulta el historial.'}>
          <option value="usuario">Usuario</option>
          <option value="administrador">Administrador</option>
        </Selector>
        <Campo
          etiqueta={usuario ? 'Contraseña nueva' : 'Contraseña inicial'}
          type="password"
          autoComplete="new-password"
          opcional={Boolean(usuario)}
          ayuda={usuario ? 'Déjala vacía para no cambiarla. Si la cambias, se cerrarán sus sesiones.' : 'Al menos 8 caracteres. Comunícasela en persona; podrá cambiarla en «Mi cuenta».'}
          value={valores.clave}
          onChange={cambiar('clave')}
          error={errores.clave}
        />
      </form>
    </Modal>
  );
}
