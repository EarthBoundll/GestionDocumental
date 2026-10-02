// La forma de las respuestas de la API (docs/04-api.md). Las fechas llegan como texto ISO.

export type Rol = 'administrador' | 'usuario';
export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada';

export interface Referencia {
  id: string;
  nombre: string;
}

export interface Pagina<T> {
  datos: T[];
  paginacion: { pagina: number; porPagina: number; total: number };
}

export interface UsuarioDeSesion {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

export interface Perfil {
  usuario: UsuarioDeSesion;
  organizacion: Referencia;
}

export interface SesionIniciada extends Perfil {
  token: string;
  expiraEn: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  documentos: number;
}

export interface DocumentoResumen {
  id: string;
  nombre: string;
  fechaDocumento: string;
  categoria: Referencia;
  subidoPor: Referencia;
  archivo: { tipoMime: string; pesoBytes: number };
  creadoEn: string;
}

export interface UltimaSolicitud {
  id: string;
  estado: EstadoSolicitud;
  solicitante: Referencia;
  revisor: Referencia | null;
  comentarioSolicitud: string | null;
  comentarioResolucion: string | null;
  creadaEn: string;
  resueltaEn: string | null;
}

export interface Documento extends Omit<DocumentoResumen, 'archivo'> {
  descripcion: string | null;
  archivo: { nombreOriginal: string; tipoMime: string; pesoBytes: number };
  actualizadoEn: string;
  ultimaSolicitud: UltimaSolicitud | null;
  permisos: { editar: boolean; eliminar: boolean; solicitarAprobacion: boolean; resolverSolicitud: boolean };
}

export interface Solicitud {
  id: string;
  estado: EstadoSolicitud;
  documento: Referencia & { eliminado: boolean };
  solicitante: Referencia;
  revisor: Referencia | null;
  comentarioSolicitud: string | null;
  comentarioResolucion: string | null;
  creadaEn: string;
  resueltaEn: string | null;
}

export interface Notificacion {
  id: string;
  tipo: 'SOLICITUD_CREADA' | 'SOLICITUD_APROBADA' | 'SOLICITUD_RECHAZADA';
  mensaje: string;
  leida: boolean;
  creadaEn: string;
  solicitudId: string;
  documentoId: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string;
}

export interface Asiento {
  id: string;
  accion: string;
  usuario: (Referencia & { email: string }) | null;
  rolUsuario: Rol | null;
  entidad: { tipo: string; id: string } | null;
  detalle: Record<string, unknown>;
  userAgent: string | null;
  esMovil: boolean | null;
  creadoEn: string;
}
