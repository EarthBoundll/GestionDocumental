import { ArrowLeft, Pencil, Power, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { plataforma } from '../../api/recursos';
import type { Administrador, EmpresaConMetricas } from '../../api/tipos';
import { Aviso, Cargando } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { Insignia } from '../../componentes/Insignia';
import { Modal } from '../../componentes/Modal';
import { EncabezadoDePagina, ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { formatearFechaHora, formatearPeso } from '../../utilidades/formato';
import { EditorDeIdentidad } from '../identidad/EditorDeIdentidad';

type AvisoDePagina = { tipo: 'exito' | 'error'; texto: string } | null;

export function DetalleEmpresa() {
  const { id = '' } = useParams();
  const ubicacion = useLocation();
  const consulta = useConsulta((senal) => plataforma.empresa(id, senal), [id]);
  const [aviso, setAviso] = useState<AvisoDePagina>(
    (ubicacion.state as { creada?: boolean } | null)?.creada
      ? { tipo: 'exito', texto: 'Empresa registrada. Su administrador ya puede entrar con su correo y la contraseña inicial.' }
      : null,
  );
  const [editandoEmpresa, setEditandoEmpresa] = useState(false);
  const [confirmandoEstado, setConfirmandoEstado] = useState(false);
  const [administrador, setAdministrador] = useState<Administrador | 'nuevo' | null>(null);

  if (consulta.error) return <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />;
  if (!consulta.datos) return <Cargando />;
  const empresa = consulta.datos;
  const hecho = (texto: string) => {
    setAviso({ tipo: 'exito', texto });
    consulta.recargar();
  };

  async function cambiarEstadoAdministrador(elegido: Administrador) {
    setAviso(null);
    try {
      await plataforma.cambiarEstadoAdministrador(elegido.id, !elegido.activo);
      hecho(elegido.activo ? `${elegido.nombre} ya no puede entrar; sus sesiones se cerraron.` : `${elegido.nombre} puede volver a entrar.`);
    } catch (error) {
      setAviso({ tipo: 'error', texto: (error as ErrorApi).mensaje });
    }
  }

  return (
    <>
      <Link to="/plataforma" className="mb-1 -ml-1 inline-flex min-h-10 items-center gap-1 rounded-lg px-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft aria-hidden className="size-4" /> Plataforma
      </Link>
      <EncabezadoDePagina
        titulo={empresa.nombre}
        descripcion={<>{empresa.ruc ? `RUC ${empresa.ruc} · ` : ''}Registrada el {formatearFechaHora(empresa.creadoEn).slice(0, 10)}</>}
        acciones={<>
          <Boton variante="secundario" icono={Pencil} onClick={() => setEditandoEmpresa(true)}>Editar</Boton>
          <Boton variante={empresa.activa ? 'peligro' : 'secundario'} icono={Power} onClick={() => setConfirmandoEstado(true)}>
            {empresa.activa ? 'Desactivar' : 'Reactivar'}
          </Boton>
        </>}
      />
      {aviso && <div className="mb-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}
      {!empresa.activa && (
        <div className="mb-4"><Aviso tipo="advertencia">Empresa desactivada: nadie de ella puede entrar hasta que la reactives. Sus datos se conservan.</Aviso></div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato titulo="Usuarios activos" valor={`${empresa.metricas.usuariosActivos} de ${empresa.metricas.usuarios}`} />
        <Dato titulo="Documentos" valor={String(empresa.metricas.documentos)} />
        <Dato titulo="Almacenamiento" valor={formatearPeso(empresa.metricas.almacenamientoBytes)} />
        <Dato titulo="Último acceso" valor={empresa.metricas.ultimoAcceso ? formatearFechaHora(empresa.metricas.ultimoAcceso) : 'Nunca'} />
      </div>

      <Tarjeta>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Administradores</h2>
            <p className="text-sm text-slate-600">Gestionan su empresa: usuarios, categorías, aprobaciones e historial.</p>
          </div>
          <Boton variante="secundario" icono={UserPlus} onClick={() => setAdministrador('nuevo')}>Nuevo administrador</Boton>
        </div>
        <ul className="divide-y divide-slate-100">
          {empresa.administradores.map((elegido) => (
            <li key={elegido.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${elegido.activo ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{elegido.nombre}</p>
                <p className="truncate text-sm text-slate-500">{elegido.email}{elegido.dni && ` · DNI ${elegido.dni}`}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!elegido.activo && <Insignia tono="peligro">Desactivado</Insignia>}
                <Boton variante="fantasma" tamano="pequeno" icono={Pencil} onClick={() => setAdministrador(elegido)}>Editar</Boton>
                <Boton variante="secundario" tamano="pequeno" onClick={() => void cambiarEstadoAdministrador(elegido)}>
                  {elegido.activo ? 'Desactivar' : 'Reactivar'}
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <section aria-labelledby="titulo-identidad" className="mt-8">
        <h2 id="titulo-identidad" className="font-semibold text-slate-900">Identidad visual</h2>
        <p className="mb-3 text-sm text-slate-600">
          Con la que la ven sus personas. Su administrador también puede cambiarla, y el historial de la empresa dice quién lo hizo.
        </p>
        <EditorDeIdentidad razonSocial={empresa.nombre} marca={empresa.marca} operaciones={plataforma.identidadDe(empresa.id)} />
      </section>

      {editandoEmpresa && (
        <DialogoEmpresa empresa={empresa} alCerrar={() => setEditandoEmpresa(false)}
          alGuardar={() => { setEditandoEmpresa(false); hecho('Cambios guardados.'); }} />
      )}
      {confirmandoEstado && (
        <DialogoEstado empresa={empresa} alCerrar={() => setConfirmandoEstado(false)}
          alGuardar={(texto) => { setConfirmandoEstado(false); hecho(texto); }} />
      )}
      {administrador && (
        <DialogoAdministrador empresaId={empresa.id} administrador={administrador === 'nuevo' ? null : administrador}
          alCerrar={() => setAdministrador(null)} alGuardar={(texto) => { setAdministrador(null); hecho(texto); }} />
      )}
    </>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Tarjeta className="p-4">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="mt-1 font-semibold text-slate-900">{valor}</p>
    </Tarjeta>
  );
}

function DialogoEmpresa({ empresa, alCerrar, alGuardar }: { empresa: EmpresaConMetricas; alCerrar(): void; alGuardar(): void }) {
  const [valores, setValores] = useState({ nombre: empresa.nombre, ruc: empresa.ruc ?? '' });
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      await plataforma.editarEmpresa(empresa.id, valores);
      alGuardar();
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <Modal abierto alCerrar={alCerrar} titulo="Editar empresa" acciones={<>
      <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
      <Boton type="submit" form="dialogo-empresa" cargando={enviando}>Guardar cambios</Boton>
    </>}>
      <form id="dialogo-empresa" onSubmit={(evento) => void guardar(evento)} className="space-y-4" noValidate>
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Campo etiqueta="Nombre o razón social" value={valores.nombre} onChange={(e) => setValores({ ...valores, nombre: e.target.value })} error={errores.nombre} />
        <Campo etiqueta="RUC" opcional inputMode="numeric" maxLength={11} value={valores.ruc} onChange={(e) => setValores({ ...valores, ruc: e.target.value })} error={errores.ruc} />
      </form>
    </Modal>
  );
}

function DialogoEstado({ empresa, alCerrar, alGuardar }: { empresa: EmpresaConMetricas; alCerrar(): void; alGuardar(texto: string): void }) {
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);
  const desactivar = empresa.activa;

  async function confirmar() {
    setEnviando(true);
    try {
      await plataforma.cambiarEstadoEmpresa(empresa.id, !desactivar);
      alGuardar(desactivar ? `${empresa.nombre} quedó desactivada y sus sesiones abiertas se cerraron.` : `${empresa.nombre} vuelve a estar activa.`);
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  return (
    <Modal abierto alCerrar={alCerrar} titulo={desactivar ? '¿Desactivar la empresa?' : '¿Reactivar la empresa?'} acciones={<>
      <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
      <Boton variante={desactivar ? 'peligro' : 'primario'} cargando={enviando} onClick={() => void confirmar()}>
        {desactivar ? 'Desactivar' : 'Reactivar'}
      </Boton>
    </>}>
      {error && <div className="mb-3"><Aviso tipo="error">{error.mensaje}</Aviso></div>}
      <p className="text-sm text-slate-700">
        {desactivar
          ? `Nadie de ${empresa.nombre} podrá entrar, y las sesiones abiertas se cerrarán ahora mismo. Sus documentos y su historial se conservan intactos.`
          : `Sus usuarios activos podrán volver a entrar con sus contraseñas de siempre.`}
      </p>
    </Modal>
  );
}

function DialogoAdministrador({ empresaId, administrador, alCerrar, alGuardar }: {
  empresaId: string; administrador: Administrador | null; alCerrar(): void; alGuardar(texto: string): void;
}) {
  const [valores, setValores] = useState({
    nombre: administrador?.nombre ?? '', email: administrador?.email ?? '', dni: administrador?.dni ?? '', clave: '',
  });
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof valores) => (evento: { target: { value: string } }) =>
    setValores((anteriores) => ({ ...anteriores, [campo]: evento.target.value }));

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    try {
      if (administrador) {
        const { clave, ...datos } = valores;
        await plataforma.editarAdministrador(administrador.id, { ...datos, ...(clave && { clave }) });
        alGuardar(clave ? 'Cambios guardados. Con la contraseña nueva, sus sesiones abiertas se cerraron.' : 'Cambios guardados.');
      } else {
        await plataforma.crearAdministrador(empresaId, valores);
        alGuardar(`${valores.nombre} ya puede entrar con su correo y la contraseña que le diste.`);
      }
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <Modal abierto alCerrar={alCerrar} titulo={administrador ? 'Editar administrador' : 'Nuevo administrador'} acciones={<>
      <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
      <Boton type="submit" form="dialogo-administrador" cargando={enviando}>{administrador ? 'Guardar cambios' : 'Crear administrador'}</Boton>
    </>}>
      <form id="dialogo-administrador" onSubmit={(evento) => void guardar(evento)} className="space-y-4" noValidate>
        {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
        <Campo etiqueta="Nombre" value={valores.nombre} onChange={cambiar('nombre')} error={errores.nombre} />
        <Campo etiqueta="Correo" type="email" inputMode="email" value={valores.email} onChange={cambiar('email')} error={errores.email}
          ayuda="Con este correo entra al sistema." />
        <Campo etiqueta="DNI" opcional inputMode="numeric" maxLength={8} value={valores.dni} onChange={cambiar('dni')} error={errores.dni} />
        <Campo
          etiqueta={administrador ? 'Contraseña nueva' : 'Contraseña inicial'}
          type="password"
          autoComplete="new-password"
          opcional={Boolean(administrador)}
          ayuda={administrador ? 'Déjala vacía para no cambiarla. Si la cambias, se cerrarán sus sesiones.' : 'Al menos 8 caracteres.'}
          value={valores.clave}
          onChange={cambiar('clave')}
          error={errores.clave}
        />
      </form>
    </Modal>
  );
}
