// La forma de las respuestas de la API (docs/04-api.md). Las fechas llegan como texto ISO.

export type Rol = 'master' | 'administrador' | 'usuario';
/** Los roles que existen dentro de una empresa. El Master no es uno de ellos. */
export type RolDeEmpresa = Exclude<Rol, 'master'>;
export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada';
/** RF32: «sistema» sigue al dispositivo. */
export type Tema = 'sistema' | 'claro' | 'oscuro';

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
  tema: Tema;
}

/** RF31: la identidad de una empresa, con el enlace del logo ya firmado. Null es «la de la plataforma». */
export interface Marca {
  nombreComercial: string | null;
  colorPrimario: string | null;
  logoUrl: string | null;
}

export interface Perfil {
  usuario: UsuarioDeSesion;
  /** Null solo para el Master, que no pertenece a ninguna empresa. */
  empresa: (Referencia & { marca: Marca }) | null;
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
  /** La versión que se pidió aprobar (RF34). */
  version: number;
}

export interface Documento extends Omit<DocumentoResumen, 'archivo'> {
  descripcion: string | null;
  archivo: { nombreOriginal: string; tipoMime: string; pesoBytes: number };
  /** El número de la versión vigente (RF34). */
  version: number;
  actualizadoEn: string;
  ultimaSolicitud: UltimaSolicitud | null;
  permisos: { editar: boolean; eliminar: boolean; solicitarAprobacion: boolean; resolverSolicitud: boolean; versionar: boolean };
}

/** Una versión de un documento (RF34). Ninguna se borra; restaurar crea otra. */
export interface Version {
  numero: number;
  archivo: { nombreOriginal: string; tipoMime: string; pesoBytes: number };
  subidaPor: Referencia;
  comentario: string | null;
  restauradaDe: number | null;
  creadaEn: string;
  vigente: boolean;
}

/** Un documento de la papelera (RF26): eliminado y aún restaurable. */
export interface DocumentoEnPapelera {
  id: string;
  nombre: string;
  categoria: Referencia;
  subidoPor: Referencia;
  eliminadoPor: Referencia | null;
  eliminadoEn: string;
  purgaEn: string;
  archivo: { tipoMime: string; pesoBytes: number };
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
  /** Null en lo que no pertenece a ninguna empresa (el Master en su cuenta, un correo desconocido). */
  empresa: Referencia | null;
  usuario: (Referencia & { email: string }) | null;
  rolUsuario: Rol | null;
  entidad: { tipo: string; id: string } | null;
  detalle: Record<string, unknown>;
  userAgent: string | null;
  esMovil: boolean | null;
  creadoEn: string;
}

/** Un paso en la vida de un documento (RF30). Sin correo: la ficha la ve cualquiera de la empresa. */
export interface ActividadDeDocumento {
  id: string;
  accion: string;
  usuario: Referencia | null;
  rolUsuario: Rol | null;
  detalle: Record<string, unknown>;
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

/** RF28: el tablero del administrador. */
export interface Tablero {
  periodo: { desde: string; hasta: string };
  resumen: {
    documentos: number; enPapelera: number; almacenamientoBytes: number; usuarios: number; usuariosActivos: number;
    categoriasActivas: number; solicitudesPendientes: number;
  };
  indicadores: {
    organizacion: { subidos: number; editados: number };
    busqueda: { busquedas: number; listados: number };
    recuperacion: {
      documentosObtenidos: number; visualizaciones: number; descargas: number; busquedasConResultado: number;
      porcentajeBusquedasConResultado: number | null;
    };
    historial: { acciones: number };
    accesoRemoto: { sesionesDesdeMovil: number; intentosDesdeMovil: number; porcentajeExitoMovil: number | null; sesiones: number };
    accesosPorRol: { denegados: number; porPermiso: { permiso: string; total: number }[] };
    tiempoRespuesta: {
      mediciones: number; servidorMediana: number | null; servidorP95: number | null; navegadorMediana: number | null; navegadorP95: number | null;
    };
  };
  /** El flujo de aprobación en el periodo (RF16); las pendientes de ahora están en el resumen. */
  aprobacion: { solicitadas: number; aprobadas: number; rechazadas: number };
  actividad: { dia: string; acciones: number }[];
  /** Las últimas acciones de la empresa, sin importar el periodo. */
  recientes: Asiento[];
}
