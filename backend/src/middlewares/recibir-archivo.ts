import type { RequestHandler } from 'express';
import multer from 'multer';
import { ErrorAplicacion } from '../compartido/errores.js';

export const PESO_MAXIMO_BYTES = 10 * 1024 * 1024;

const receptor = multer({
  // En memoria: Render no tiene disco persistente, y con 10 MB de tope cabe sin problema (D10).
  storage: multer.memoryStorage(),
  limits: { fileSize: PESO_MAXIMO_BYTES, files: 1, fields: 10, fieldSize: 2_000 },
  // Los navegadores envían el nombre del archivo en UTF-8; multer lo leería como latin1 y «cotización.pdf»
  // llegaría como «cotizaciÃ³n.pdf».
  defParamCharset: 'utf8',
}).single('archivo');

/** Recibe un formulario multipart con un único archivo en el campo `archivo`. */
export const recibirArchivo: RequestHandler = (req, res, next) => {
  receptor(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new ErrorAplicacion(413, 'ARCHIVO_DEMASIADO_GRANDE', 'El archivo supera los 10 MB'));
        return;
      }
      next(new ErrorAplicacion(400, 'VALIDACION', 'El formulario no es válido', {
        detalles: [{ campo: error.field ?? 'archivo', mensaje: 'Envía un solo archivo, en el campo «archivo»' }],
      }));
      return;
    }
    next(error);
  });
};
