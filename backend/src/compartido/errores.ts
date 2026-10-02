/** Códigos de error de la API (docs/04-api.md §2). Cada fase añade los suyos. */
export type CodigoError =
  | 'VALIDACION'
  | 'NO_AUTENTICADO'
  | 'CREDENCIALES_INVALIDAS'
  | 'SIN_PERMISO'
  | 'USUARIO_INACTIVO'
  | 'REGISTRO_CERRADO'
  | 'NO_ENCONTRADO'
  | 'EMAIL_EN_USO'
  | 'CATEGORIA_DUPLICADA'
  | 'CATEGORIA_INACTIVA'
  | 'DOCUMENTO_EN_REVISION'
  | 'OPERACION_SOBRE_SI_MISMO'
  | 'SOLICITUD_PENDIENTE'
  | 'SIN_REVISOR'
  | 'SOLICITUD_RESUELTA'
  | 'ARCHIVO_DEMASIADO_GRANDE'
  | 'CUERPO_DEMASIADO_GRANDE'
  | 'TIPO_NO_PERMITIDO'
  | 'DEMASIADOS_INTENTOS'
  | 'ERROR_INTERNO'
  | 'SERVICIO_NO_DISPONIBLE';

export interface DetalleError {
  campo: string;
  mensaje: string;
}

/** Un error previsto: el manejador central lo convierte tal cual en la respuesta HTTP. */
export class ErrorAplicacion extends Error {
  readonly estado: number;
  readonly codigo: CodigoError;
  readonly detalles: DetalleError[] | undefined;

  constructor(
    estado: number,
    codigo: CodigoError,
    mensaje: string,
    opciones: { detalles?: DetalleError[]; cause?: unknown } = {},
  ) {
    super(mensaje, { cause: opciones.cause });
    this.name = 'ErrorAplicacion';
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = opciones.detalles;
  }
}

export const noAutenticado = () => new ErrorAplicacion(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar');

export const noEncontrado = (mensaje: string) => new ErrorAplicacion(404, 'NO_ENCONTRADO', mensaje);
