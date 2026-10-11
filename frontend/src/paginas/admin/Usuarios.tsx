import { Pencil, Search, Send, Trash2, UserPlus, Users as IconoUsuarios } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../../api/cliente';
import { usuarios } from '../../api/recursos';
import type { RolDeEmpresa, Usuario } from '../../api/tipos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo, Selector } from '../../componentes/Campos';
import { Insignia, InsigniaDeCorreo } from '../../componentes/Insignia';
import { Modal } from '../../componentes/Modal';
import { EncabezadoDePagina, ErrorDeCarga, Paginacion, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { useSesion } from '../../sesion/SesionContext';
import { avisoDeInvitacion, type AvisoDePagina } from '../../utilidades/invitaciones';

/** Desactivar se deshace; eliminar es para siempre (D46). Las dos se confirman antes. */
type Confirmacion = { usuario: Usuario; accion: 'desactivar' | 'eliminar' };

/** Lo que pasó con el último reenvío de una cuenta, dicho en su propia fila: es donde se está mirando. */
type ResultadoDeReenvio = { tipo: 'exito' | 'error'; texto: string };

const HORA = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });

export function Usuarios() {
  const { sesion } = useSesion();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  // Por defecto, las cuentas en uso; las desactivadas, aparte (D46), para que no se acumulen en la lista.
  const [vista, setVista] = useState<'activos' | 'desactivados'>('activos');
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null);
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null);
  const [aviso, setAviso] = useState<AvisoDePagina | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const [reenvios, setReenvios] = useState<Record<string, ResultadoDeReenvio>>({});
  const consulta = useConsulta(
    (senal) => usuarios.listar({ q: busqueda || undefined, activo: vista === 'activos', pagina }, senal),
    [busqueda, vista, pagina],
  );

  function avisar(nuevo: AvisoDePagina) {
    setAviso(nuevo);
    // El aviso va arriba de la lista; si se actuó más abajo, se lleva a la vista.
    requestAnimationFrame(() => document.getElementById('aviso-de-usuarios')?.scrollIntoView?.({ block: 'nearest' }));
  }

  async function reactivar(usuario: Usuario) {
    setAviso(null);
    try {
      await usuarios.cambiarEstado(usuario.id, true);
      avisar({ tipo: 'exito', texto: `${usuario.nombre} puede volver a entrar.` });
      consulta.recargar();
    } catch (error) {
      avisar({ tipo: 'error', texto: (error as ErrorApi).mensaje });
    }
  }

  async function reenviar(usuario: Usuario) {
    setReenviando(usuario.id);
    try {
      await usuarios.reenviarInvitacion(usuario.id);
      setReenvios((anteriores) => ({ ...anteriores, [usuario.id]: {
        tipo: 'exito',
        texto: `Enlace nuevo enviado a las ${HORA.format(new Date())}. Los anteriores ya no sirven: que abra el correo más reciente.`,
      } }));
    } catch (error) {
      setReenvios((anteriores) => ({ ...anteriores, [usuario.id]: { tipo: 'error', texto: (error as ErrorApi).mensaje } }));
    } finally {
      setReenviando(null);
    }
  }

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    setPagina(1);
    setBusqueda(texto.trim());
  }

  function verVista(nueva: 'activos' | 'desactivados') {
    setVista(nueva);
    setPagina(1);
  }

  if (consulta.error?.estado === 403) return <ErrorDeCarga error={consulta.error} />;
  return (
    <>
      <EncabezadoDePagina
        titulo="Usuarios"
        descripcion="Las personas de tu empresa que pueden entrar al sistema."
        acciones={<Boton icono={UserPlus} onClick={() => setEditando('nuevo')}>Nuevo usuario</Boton>}
      />
      <div id="aviso-de-usuarios" className="scroll-mt-20">{aviso && <div className="mb-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}</div>

      <Tarjeta>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end">
          <form role="search" onSubmit={buscar} className="flex flex-1 gap-2">
            <div className="flex-1"><Campo etiqueta="Buscar por nombre o correo" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} /></div>
            <Boton type="submit" variante="secundario" icono={Search} className="mt-7 self-start" aria-label="Buscar"><span className="hidden sm:inline">Buscar</span></Boton>
          </form>
          <div role="group" aria-label="Qué cuentas mostrar" className="flex rounded-lg bg-slate-100 p-1 text-sm">
            {(['activos', 'desactivados'] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                aria-pressed={vista === opcion}
                onClick={() => verVista(opcion)}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition sm:flex-none ${vista === opcion ? 'bg-superficie text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {opcion === 'activos' ? 'Activos' : 'Desactivados'}
              </button>
            ))}
          </div>
        </div>
        {consulta.error ? (
          <div className="p-4"><ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} /></div>
        ) : !consulta.datos ? (
          <Cargando />
        ) : consulta.datos.datos.length === 0 ? (
          <EstadoVacio icono={IconoUsuarios} titulo={busqueda ? 'Nadie coincide con la búsqueda' : vista === 'activos' ? 'Todavía no hay cuentas' : 'No hay cuentas desactivadas'} />
        ) : (
          <>
            <ul className="escalonado divide-y divide-slate-100">
              {consulta.datos.datos.map((usuario) => {
                const esUnoMismo = usuario.id === sesion?.usuario.id;
                const reenvio = reenvios[usuario.id];
                return (
                  <li key={usuario.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${usuario.activo ? 'text-slate-900' : 'text-slate-500'}`}>
                        {usuario.nombre}{esUnoMismo && <span className="font-normal text-slate-500"> (tú)</span>}
                      </p>
                      <p className="truncate text-sm text-slate-500">{usuario.email}{usuario.dni && ` · DNI ${usuario.dni}`}</p>
                      {reenvio && (
                        <p role={reenvio.tipo === 'error' ? 'alert' : 'status'} className={`mt-1 text-xs ${reenvio.tipo === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
                          {reenvio.texto}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Insignia tono={usuario.rol === 'administrador' ? 'marca' : 'neutro'}>{usuario.rol === 'administrador' ? 'Administrador' : 'Usuario'}</Insignia>
                      <InsigniaDeCorreo estado={usuario.estado} />
                      {!usuario.activo && <Insignia tono="peligro">Desactivado</Insignia>}
                      {usuario.activo && usuario.estado !== 'verificado' && (
                        <Boton variante="fantasma" tamano="pequeno" icono={Send} cargando={reenviando === usuario.id} onClick={() => void reenviar(usuario)}>
                          {usuario.estado === 'pendiente' ? 'Reenviar invitación' : 'Reenviar verificación'}
                        </Boton>
                      )}
                      <Boton variante="fantasma" tamano="pequeno" icono={Pencil} onClick={() => setEditando(usuario)}>Editar</Boton>
                      {/* RN03: nadie se desactiva ni se elimina a sí mismo. La API y la base también lo impiden; aquí solo se evita ofrecerlo. */}
                      {!esUnoMismo && (usuario.activo
                        ? <Boton variante="secundario" tamano="pequeno" onClick={() => setConfirmando({ usuario, accion: 'desactivar' })}>Desactivar</Boton>
                        : <Boton variante="secundario" tamano="pequeno" onClick={() => void reactivar(usuario)}>Reactivar</Boton>)}
                      {!esUnoMismo && (
                        <Boton variante="fantasma" tamano="pequeno" icono={Trash2} className="text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmando({ usuario, accion: 'eliminar' })} aria-label={`Eliminar a ${usuario.nombre}`}>
                          Eliminar
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
          alGuardar={(resultado) => { setEditando(null); avisar(resultado); consulta.recargar(); }}
        />
      )}
      {confirmando && (
        <DialogoDeCuenta
          {...confirmando}
          alCerrar={() => setConfirmando(null)}
          alTerminar={(textoDeAviso) => { setConfirmando(null); avisar({ tipo: 'exito', texto: textoDeAviso }); consulta.recargar(); }}
        />
      )}
    </>
  );
}

/**
 * Confirmar antes de desactivar o eliminar una cuenta (D46): nombra a la persona y dice qué pasa. Desactivar se
 * deshace desde «Desactivados»; eliminar no, pero no borra lo que hizo: su nombre sigue en sus documentos.
 */
function DialogoDeCuenta({ usuario, accion, alCerrar, alTerminar }: Confirmacion & { alCerrar(): void; alTerminar(aviso: string): void }) {
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);
  const eliminar = accion === 'eliminar';

  async function confirmar() {
    setError(null);
    setEnviando(true);
    try {
      if (eliminar) await usuarios.eliminar(usuario.id);
      else await usuarios.cambiarEstado(usuario.id, false);
      alTerminar(eliminar
        ? `Se eliminó la cuenta de ${usuario.nombre}. Su nombre sigue en sus documentos y en el historial.`
        : `${usuario.nombre} ya no puede entrar; sus sesiones se cerraron. La puedes reactivar desde «Desactivados».`);
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={eliminar ? 'Eliminar la cuenta' : 'Desactivar la cuenta'}
      acciones={<>
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton variante="peligro" cargando={enviando} onClick={() => void confirmar()}>{eliminar ? 'Eliminar para siempre' : 'Desactivar'}</Boton>
      </>}
    >
      <div className="space-y-3 text-sm text-slate-700">
        {error && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <p><strong className="text-slate-900">{usuario.nombre}</strong> · {usuario.email}</p>
        {eliminar ? (
          <>
            <ul className="list-disc space-y-1 pl-5">
              <li>No podrá volver a entrar y su cuenta dejará de aparecer. <strong>No se puede deshacer.</strong></li>
              <li>Sus documentos, sus solicitudes y el historial se conservan con su nombre.</li>
              <li>Se borran su correo, su DNI y su contraseña: el correo queda libre para una nueva invitación.</li>
            </ul>
            {usuario.activo && <p className="text-slate-600">Si solo es por un tiempo, usa «Desactivar»: se puede deshacer.</p>}
          </>
        ) : (
          <p>
            No podrá entrar y se cerrarán sus sesiones abiertas. Sus documentos y el historial no cambian, y la puedes reactivar
            cuando quieras desde «Desactivados».
          </p>
        )}
      </div>
    </Modal>
  );
}

function DialogoUsuario({ usuario, esUnoMismo, alCerrar, alGuardar }: {
  usuario: Usuario | null; esUnoMismo: boolean; alCerrar(): void; alGuardar(aviso: AvisoDePagina): void;
}) {
  const [valores, setValores] = useState({
    nombre: usuario?.nombre ?? '', email: usuario?.email ?? '', dni: usuario?.dni ?? '', rol: usuario?.rol ?? 'usuario' as RolDeEmpresa, clave: '',
  });
  // Una cuenta pendiente define su contraseña al aceptar la invitación: ofrecer otra aquí solo confundiría.
  const conClave = usuario !== null && usuario.estado !== 'pendiente';
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
        alGuardar({ tipo: 'exito', texto: valores.clave ? 'Cambios guardados. Con la contraseña nueva, sus sesiones abiertas se cerraron.' : 'Cambios guardados.' });
      } else {
        const { clave: _sinClave, ...datos } = valores;
        const creado = await usuarios.crear(datos);
        alGuardar(avisoDeInvitacion(creado.nombre, creado.email, creado.invitacionEnviada));
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
          ayuda={usuario
            ? 'El correo es su usuario de acceso y no se cambia.'
            : 'Le llegará una invitación a este correo: al abrirla define su contraseña, que nadie más conocerá. Sin abrirla no puede entrar.'} />
        <Campo etiqueta="DNI" opcional inputMode="numeric" maxLength={8} value={valores.dni} onChange={cambiar('dni')} error={errores.dni}
          ayuda="Es un dato de su perfil; no sirve para entrar." />
        <Selector etiqueta="Rol" disabled={esUnoMismo} value={valores.rol} onChange={cambiar('rol')} error={errores.rol}
          ayuda={esUnoMismo ? 'Tu propio rol lo cambia otro administrador.' : 'El administrador gestiona usuarios y categorías, resuelve solicitudes y consulta el historial.'}>
          <option value="usuario">Usuario</option>
          <option value="administrador">Administrador</option>
        </Selector>
        {conClave && (
          <Campo
            etiqueta="Contraseña nueva"
            type="password"
            autoComplete="new-password"
            opcional
            ayuda="Déjala vacía para no cambiarla. Si la cambias, se cerrarán sus sesiones."
            value={valores.clave}
            onChange={cambiar('clave')}
            error={errores.clave}
          />
        )}
      </form>
    </Modal>
  );
}
