// La forma de las respuestas de la API (docs/04-api.md). Las fechas llegan como texto ISO.

export type Rol = 'master' | 'administrador' | 'usuario';
/** Los roles que existen dentro de una empresa. El Master no es uno de ellos. */
export type RolDeEmpresa = Exclude<Rol, 'master'>;
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
  dni: string | null;
}

export interface Perfil {
  usuario: UsuarioDeSesion;
  /** Null solo para el Master, que no pertenece a ninguna empresa. */
  empresa: Referencia | null;
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
  /** Solo la ven los administradores y las personas autorizadas (RF25). */
  restringida: boolean;
  /** Las personas autorizadas. Solo llega llena para los administradores. */
  usuariosAutorizados: string[];
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
  rol: RolDeEmpresa;
  dni: string | null;
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

// La plataforma: lo que ve el Administrador Master. Cifras de cada empresa, nunca su contenido.

export interface Metricas {
  usuarios: number;
  usuariosActivos: number;
  documentos: number;
  almacenamientoBytes: number;
  ultimoAcceso: string | null;
}

export interface Empresa {
  id: string;
  nombre: string;
  ruc: string | null;
  activa: boolean;
  creadoEn: string;
}

export interface EmpresaConMetricas extends Empresa {
  metricas: Metricas;
}

export interface Administrador {
  id: string;
  empresaId: string;
  nombre: string;
  email: string;
  dni: string | null;
  activo: boolean;
  creadoEn: string;
}

export interface MetricasDePlataforma extends Metricas {
  empresas: number;
  empresasActivas: number;
}
