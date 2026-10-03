import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ErrorAplicacion } from '../compartido/errores.js';

const MINUTO = 60_000;

const responder: RequestHandler = (_req, _res, next) => {
  next(new ErrorAplicacion(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera unos minutos y vuelve a probar'));
};

/** Frenos contra la fuerza bruta (RN20). Se crean con cada app para que sus contadores no se compartan. */
export function crearLimitadores(): Record<'inicioSesion' | 'recuperacion' | 'confirmacion', RequestHandler> {
  const comunes = { standardHeaders: 'draft-8', legacyHeaders: false, handler: responder } as const;
  return {
    // Solo cuentan los intentos fallidos. En una MYPE toda la oficina sale a internet con la misma IP:
    // cinco personas entrando bien a la vez no deben bloquearse entre sí.
    inicioSesion: rateLimit({ ...comunes, windowMs: 15 * MINUTO, limit: 10, skipSuccessfulRequests: true }),
    // Cada petición puede mandar un correo: sin freno, la API serviría para inundar el buzón de alguien.
    recuperacion: rateLimit({ ...comunes, windowMs: 60 * MINUTO, limit: 10 }),
    // Probar enlaces al azar es inútil (256 bits), pero tampoco se deja intentar sin límite.
    confirmacion: rateLimit({ ...comunes, windowMs: 15 * MINUTO, limit: 10, skipSuccessfulRequests: true }),
  };
}
