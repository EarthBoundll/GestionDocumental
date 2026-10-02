import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ErrorAplicacion, type CodigoError, type DetalleError } from '../compartido/errores.js';

interface Respuesta {
  estado: number;
  cuerpo: { codigo: CodigoError; mensaje: string; detalles?: DetalleError[] };
}

export const rutaNoEncontrada: RequestHandler = (req) => {
  throw new ErrorAplicacion(404, 'NO_ENCONTRADO', `No existe la ruta ${req.method} ${req.path}`);
};

/** Único punto donde un error se convierte en respuesta HTTP (docs/04-api.md §2). */
export const manejarErrores: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const { estado, cuerpo } = traducir(error);
  // Los 4xx son el cliente equivocándose; solo lo que falla en el servidor merece su registro.
  if (estado >= 500) console.error(`[${req.method} ${req.originalUrl}]`, error);
  res.status(estado).json({ error: cuerpo });
};

function traducir(error: unknown): Respuesta {
  if (error instanceof ErrorAplicacion) {
    const { codigo, message: mensaje, detalles } = error;
    return { estado: error.estado, cuerpo: detalles ? { codigo, mensaje, detalles } : { codigo, mensaje } };
  }
  if (error instanceof ZodError) {
    return {
      estado: 400,
      cuerpo: {
        codigo: 'VALIDACION',
        mensaje: 'Revisa los datos enviados',
        detalles: error.issues.map((problema) => ({
          campo: problema.path.map(String).join('.'),
          mensaje: problema.message,
        })),
      },
    };
  }
  if (esErrorAlLeerElCuerpo(error)) {
    if (error.type === 'entity.too.large') {
      return { estado: 413, cuerpo: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El cuerpo de la petición es demasiado grande' } };
    }
    const mensaje = error.type === 'entity.parse.failed'
      ? 'El cuerpo de la petición no es JSON válido'
      : 'No se pudo leer el cuerpo de la petición';
    return { estado: 400, cuerpo: { codigo: 'VALIDACION', mensaje } };
  }
  // Lo inesperado no revela nada de su interior: el detalle queda en el registro del servidor.
  return { estado: 500, cuerpo: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' } };
}

/** Los errores de express.json() traen un `type` y un estado 4xx. */
function esErrorAlLeerElCuerpo(error: unknown): error is { type: string; status: number } {
  return (
    typeof error === 'object' && error !== null
    && 'type' in error && typeof error.type === 'string'
    && 'status' in error && typeof error.status === 'number' && error.status < 500
  );
}
