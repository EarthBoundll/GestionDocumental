import type { Request } from 'express';
import { noAutenticado, noEncontrado } from './errores.js';
import type { Rol } from './permisos.js';

/** Lo que el historial guarda de cada petición, además de quién la hizo. */
export interface Contexto {
  userAgent: string | null;
  esMovil: boolean;
}

export interface UsuarioAutenticado {
  id: string;
  organizacionId: string;
  nombre: string;
  email: string;
  rol: Rol;
}

export interface Autenticacion {
  sesionId: string;
  usuario: UsuarioAutenticado;
}

/** Quién actúa y desde dónde: lo que un servicio necesita saber de la petición, sin conocer Express. */
export interface Actor {
  autenticacion: Autenticacion;
  contexto: Contexto;
}

declare global {
  namespace Express {
    interface Request {
      contexto: Contexto;
      /** performance.now() al llegar la petición: el inicio del tiempo de respuesta (indicador 7). */
      recibidaEn: number;
      autenticacion?: Autenticacion;
    }
  }
}

export function actorDe(req: Request): Actor {
  if (!req.autenticacion) throw noAutenticado();
  return { autenticacion: req.autenticacion, contexto: req.contexto };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El id de la URL. Si ni siquiera tiene forma de id, el recurso no existe: 404, no un error de la base. */
export function idDeRuta(req: Request, parametro = 'id'): string {
  const id = req.params[parametro];
  if (typeof id !== 'string' || !UUID.test(id)) throw noEncontrado('No existe');
  return id;
}
