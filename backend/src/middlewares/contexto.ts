import type { RequestHandler } from 'express';
import { esMovil } from '../compartido/dispositivo.js';

/** Deja en la petición lo que el historial guarda del dispositivo (indicador 5) y cuándo llegó (indicador 7). */
export const contexto: RequestHandler = (req, _res, next) => {
  req.recibidaEn = performance.now();
  // Una cabecera vacía es lo mismo que no tenerla: en el historial, «sin navegador» siempre es null.
  const userAgent = req.get('user-agent')?.slice(0, 300) || null;
  req.contexto = { userAgent, esMovil: esMovil(userAgent, req.get('sec-ch-ua-mobile')) };
  next();
};
