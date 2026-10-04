import { api, descargar } from './cliente';
import type {
  Administrador, Asiento, Categoria, Documento, DocumentoResumen, Empresa, EmpresaConMetricas, EstadoSolicitud, MetricasDePlataforma,
  Notificacion, Pagina, Perfil, RolDeEmpresa, SesionIniciada, Solicitud, Usuario,
} from './tipos';

// Una función por endpoint de docs/04-api.md, agrupadas por recurso.

export const auth = {
  iniciarSesion: (email: string, clave: string) => api<SesionIniciada>('/auth/login', { metodo: 'POST', cuerpo: { email, clave } }),
  cerrarSesion: () => api<void>('/auth/logout', { metodo: 'POST' }),
  perfil: (senal?: AbortSignal) => api<Perfil>('/auth/yo', { senal }),
  cambiarClave: (claveActual: string, claveNueva: string) => api<void>('/auth/clave', { metodo: 'PUT', cuerpo: { claveActual, claveNueva } }),
  solicitarRecuperacion: (email: string) => api<{ mensaje: string }>('/auth/recuperacion', { metodo: 'POST', cuerpo: { email } }),
  confirmarRecuperacion: (token: string, claveNueva: string) =>
    api<void>('/auth/recuperacion/confirmar', { metodo: 'POST', cuerpo: { token, claveNueva } }),
};

export interface FiltrosDocumentos {
  q?: string;
  categoriaId?: string;
  desde?: string;
  hasta?: string;
  orden?: 'recientes' | 'fecha' | 'nombre';
  pagina?: number;
}

export const documentos = {
  listar: (filtros: FiltrosDocumentos, senal?: AbortSignal) =>
    api<Pagina<DocumentoResumen> & { tiempoRespuestaId: string | null }>('/documentos', { consulta: { ...filtros }, senal }),
  subir: (formulario: FormData) => api<Documento>('/documentos', { metodo: 'POST', formulario }),
  obtener: (id: string, senal?: AbortSignal) => api<Documento>(`/documentos/${id}`, { senal }),
  editar: (id: string, cambios: Partial<{ nombre: string; categoriaId: string; fechaDocumento: string; descripcion: string | null }>) =>
    api<Documento>(`/documentos/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  eliminar: (id: string) => api<void>(`/documentos/${id}`, { metodo: 'DELETE' }),
  enlace: (id: string, modo: 'ver' | 'descargar') => api<{ url: string; expiraEn: string }>(`/documentos/${id}/archivo`, { consulta: { modo } }),
  solicitarAprobacion: (id: string, comentario: string) =>
    api<Solicitud>(`/documentos/${id}/solicitudes`, { metodo: 'POST', cuerpo: { comentario } }),
};

export const tiemposRespuesta = {
  completar: (id: string, duracionClienteMs: number) =>
    api<void>(`/tiempos-respuesta/${id}`, { metodo: 'PATCH', cuerpo: { duracionClienteMs } }),
};

export const categorias = {
  listar: (incluirInactivas = false, senal?: AbortSignal) =>
    api<{ datos: Categoria[] }>('/categorias', { consulta: { incluirInactivas: incluirInactivas || undefined }, senal }),
  crear: (datos: { nombre: string; descripcion?: string; restringida?: boolean; usuariosAutorizados?: string[] }) =>
    api<Categoria>('/categorias', { metodo: 'POST', cuerpo: datos }),
  editar: (id: string, cambios: Partial<{
    nombre: string; descripcion: string | null; activa: boolean; restringida: boolean; usuariosAutorizados: string[];
  }>) =>
    api<Categoria>(`/categorias/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
};

export const solicitudes = {
  listar: (filtros: { estado?: EstadoSolicitud; pagina?: number }, senal?: AbortSignal) =>
    api<Pagina<Solicitud>>('/solicitudes', { consulta: { ...filtros }, senal }),
  resolver: (id: string, decision: 'aprobada' | 'rechazada', comentario: string) =>
    api<Solicitud>(`/solicitudes/${id}/resolucion`, { metodo: 'POST', cuerpo: { decision, comentario } }),
};

/** Se emite al marcar notificaciones como leídas: la campana, en otra parte de la pantalla, actualiza su contador. */
export const NOTIFICACIONES_LEIDAS = 'notificaciones-leidas';

async function avisandoALaCampana(peticion: Promise<void>): Promise<void> {
  await peticion;
  window.dispatchEvent(new Event(NOTIFICACIONES_LEIDAS));
}

export const notificaciones = {
  listar: (filtros: { soloNoLeidas?: boolean; pagina?: number; porPagina?: number }, senal?: AbortSignal) =>
    api<Pagina<Notificacion> & { noLeidas: number }>('/notificaciones', { consulta: { ...filtros }, senal }),
  marcarLeida: (id: string) => avisandoALaCampana(api<void>(`/notificaciones/${id}/leida`, { metodo: 'PATCH' })),
  marcarTodas: () => avisandoALaCampana(api<void>('/notificaciones/leidas', { metodo: 'PATCH' })),
};

export const usuarios = {
  listar: (filtros: { q?: string; rol?: RolDeEmpresa; activo?: boolean; pagina?: number; porPagina?: number }, senal?: AbortSignal) =>
    api<Pagina<Usuario>>('/usuarios', { consulta: { ...filtros }, senal }),
  crear: (datos: { nombre: string; email: string; dni: string; clave: string; rol: RolDeEmpresa }) =>
    api<Usuario>('/usuarios', { metodo: 'POST', cuerpo: datos }),
  editar: (id: string, cambios: Partial<{ nombre: string; dni: string; rol: RolDeEmpresa; clave: string }>) =>
    api<Usuario>(`/usuarios/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  cambiarEstado: (id: string, activo: boolean) => api<Usuario>(`/usuarios/${id}/estado`, { metodo: 'PATCH', cuerpo: { activo } }),
};

export interface FiltrosHistorial {
  usuarioId?: string;
  accion?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
}

export const historial = {
  listar: (filtros: FiltrosHistorial, senal?: AbortSignal) => api<Pagina<Asiento>>('/historial', { consulta: { ...filtros }, senal }),
  exportar: (filtros: Omit<FiltrosHistorial, 'pagina'>) => descargar('/historial/exportar', { ...filtros }, 'historial.csv'),
};

interface DatosDeAdministrador {
  nombre: string;
  email: string;
  dni: string;
  clave: string;
}

/** El área del Master (decisión B): crea empresas con su primer administrador y ve sus cifras. */
export const plataforma = {
  metricas: (senal?: AbortSignal) => api<MetricasDePlataforma>('/plataforma/metricas', { senal }),
  empresas: (senal?: AbortSignal) => api<{ datos: EmpresaConMetricas[] }>('/plataforma/empresas', { senal }),
  empresa: (id: string, senal?: AbortSignal) =>
    api<EmpresaConMetricas & { administradores: Administrador[] }>(`/plataforma/empresas/${id}`, { senal }),
  crearEmpresa: (datos: { empresa: { nombre: string; ruc: string }; administrador: DatosDeAdministrador }) =>
    api<{ empresa: Empresa; administrador: Administrador }>('/plataforma/empresas', { metodo: 'POST', cuerpo: datos }),
  editarEmpresa: (id: string, cambios: Partial<{ nombre: string; ruc: string }>) =>
    api<Empresa>(`/plataforma/empresas/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  cambiarEstadoEmpresa: (id: string, activa: boolean) =>
    api<Empresa>(`/plataforma/empresas/${id}/estado`, { metodo: 'PATCH', cuerpo: { activa } }),
  crearAdministrador: (empresaId: string, datos: DatosDeAdministrador) =>
    api<Administrador>(`/plataforma/empresas/${empresaId}/administradores`, { metodo: 'POST', cuerpo: datos }),
  editarAdministrador: (id: string, cambios: Partial<Omit<DatosDeAdministrador, 'email'> & { email: string }>) =>
    api<Administrador>(`/plataforma/administradores/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
  cambiarEstadoAdministrador: (id: string, activo: boolean) =>
    api<Administrador>(`/plataforma/administradores/${id}/estado`, { metodo: 'PATCH', cuerpo: { activo } }),
};
