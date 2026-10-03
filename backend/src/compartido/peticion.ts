import type { Request } from 'express';
import type { AccesoADatos } from '../db/acceso.js';
import { noAutenticado, noEncontrado } from './errores.js';
import type { Rol } from './permisos.js';

/** Lo que el historial guarda de cada petición, además de quién la hizo. */
export interface Contexto {
  userAgent: string | null;
  esMovil: boolean;
}

export interface UsuarioAutenticado {
  id: string;
  /** Null solo para el Master, que no pertenece a ninguna empresa. */
  empresaId: string | null;
  nombre: string;
  email: string;
  rol: Rol;
}

export interface Autenticacion {
  sesionId: string;
  usuario: UsuarioAutenticado;
}

/**
 * Quién actúa, desde dónde y con qué acceso a los datos: lo que un servicio necesita saber de la
 * petición, sin conocer Express. El acceso lo crea la autenticación a partir de la identidad, nunca de
 * lo que envía el cliente (CLAUDE.md v2).
 */
export interface Actor {
  autenticacion: Autenticacion;
  contexto: Contexto;
  datos: AccesoADatos;
}

declare global {
  namespace Express {
    interface Request {
      contexto: Contexto;
      /** performance.now() al llegar la petición: el inicio del tiempo de respuesta (indicador 7). */
      recibidaEn: number;
      autenticacion?: Autenticacion;
      datos?: AccesoADatos;
    }
  }
}

export function actorDe(req: Request): Actor {
  if (!req.autenticacion || !req.datos) throw noAutenticado();
  return { autenticacion: req.autenticacion, contexto: req.contexto, datos: req.datos };
}

/**
 * La empresa del actor, para los servicios que solo funcionan dentro de una. Las rutas de empresa
 * exigen USAR_DATOS_DE_EMPRESA, así que aquí nunca llega el Master: si llegara, es un error del programa.
 */
export function empresaDe(actor: Actor): string {
  const { empresaId } = actor.autenticacion.usuario;
  if (!empresaId) throw new Error('Una ruta de empresa recibió a un usuario sin empresa: falta exigir USAR_DATOS_DE_EMPRESA');
  return empresaId;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El id de la URL. Si ni siquiera tiene forma de id, el recurso no existe: 404, no un error de la base. */
export function idDeRuta(req: Request, parametro = 'id'): string {
  const id = req.params[parametro];
  if (typeof id !== 'string' || !UUID.test(id)) throw noEncontrado('No existe');
  return id;
}
