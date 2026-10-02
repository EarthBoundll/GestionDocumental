import { api, descargar } from './cliente';
import type {
  Asiento, Categoria, Documento, DocumentoResumen, EstadoSolicitud, Notificacion, Pagina, Perfil, Rol, SesionIniciada,
  Solicitud, Usuario,
} from './tipos';

// Una función por endpoint de docs/04-api.md, agrupadas por recurso.

export const auth = {
  registrar: (datos: { organizacion: { nombre: string; ruc?: string }; administrador: { nombre: string; email: string; clave: string } }) =>
    api<SesionIniciada>('/auth/registro', { metodo: 'POST', cuerpo: datos }),
  iniciarSesion: (email: string, clave: string) => api<SesionIniciada>('/auth/login', { metodo: 'POST', cuerpo: { email, clave } }),
  cerrarSesion: () => api<void>('/auth/logout', { metodo: 'POST' }),
  perfil: (senal?: AbortSignal) => api<Perfil>('/auth/yo', { senal }),
  cambiarClave: (claveActual: string, claveNueva: string) => api<void>('/auth/clave', { metodo: 'PUT', cuerpo: { claveActual, claveNueva } }),
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
  crear: (datos: { nombre: string; descripcion?: string }) => api<Categoria>('/categorias', { metodo: 'POST', cuerpo: datos }),
  editar: (id: string, cambios: Partial<{ nombre: string; descripcion: string | null; activa: boolean }>) =>
    api<Categoria>(`/categorias/${id}`, { metodo: 'PATCH', cuerpo: cambios }),
};

export const solicitudes = {
  listar: (filtros: { estado?: EstadoSolicitud; pagina?: number }, senal?: AbortSignal) =>
    api<Pagina<Solicitud>>('/solicitudes', { consulta: { ...filtros }, senal }),
  resolver: (id: string, decision: 'aprobada' | 'rechazada', comentario: string) =>
    api<Solicitud>(`/solicitudes/${id}/resolucion`, { metodo: 'POST', cuerpo: { decision, comentario } }),
};

export const notificaciones = {
  listar: (filtros: { soloNoLeidas?: boolean; pagina?: number; porPagina?: number }, senal?: AbortSignal) =>
    api<Pagina<Notificacion> & { noLeidas: number }>('/notificaciones', { consulta: { ...filtros }, senal }),
  marcarLeida: (id: string) => api<void>(`/notificaciones/${id}/leida`, { metodo: 'PATCH' }),
  marcarTodas: () => api<void>('/notificaciones/leidas', { metodo: 'PATCH' }),
};

export const usuarios = {
  listar: (filtros: { q?: string; rol?: Rol; activo?: boolean; pagina?: number; porPagina?: number }, senal?: AbortSignal) =>
    api<Pagina<Usuario>>('/usuarios', { consulta: { ...filtros }, senal }),
  crear: (datos: { nombre: string; email: string; clave: string; rol: Rol }) => api<Usuario>('/usuarios', { metodo: 'POST', cuerpo: datos }),
  editar: (id: string, cambios: Partial<{ nombre: string; rol: Rol; clave: string }>) =>
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
