import { vi } from 'vitest';
import type { Rol, SesionIniciada } from '../api/tipos';

export interface PeticionRecibida {
  metodo: string;
  ruta: string;
  consulta: URLSearchParams;
  cuerpo: unknown;
  token: string | null;
}

interface Respuesta {
  estado?: number;
  cuerpo?: unknown;
  cabeceras?: Record<string, string>;
}

type Definicion = Respuesta | ((peticion: PeticionRecibida) => Respuesta);

/**
 * Sustituye a fetch por una API en memoria. Las rutas se escriben como en docs/04-api.md, con su método:
 * «GET /documentos/:id». Una petición sin token a una ruta que lo exige recibe 401, como en la API real.
 */
export function simularApi(rutas: Record<string, Definicion>) {
  const peticiones: PeticionRecibida[] = [];
  const PUBLICAS = ['POST /auth/login', 'POST /auth/recuperacion', 'POST /auth/recuperacion/confirmar'];

  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const direccion = new URL(url);
    const ruta = direccion.pathname.replace(/^\/api\/v1/, '');
    const metodo = init.method ?? 'GET';
    const autorizacion = (init.headers as Record<string, string> | undefined)?.Authorization;
    const peticion: PeticionRecibida = {
      metodo,
      ruta,
      consulta: direccion.searchParams,
      cuerpo: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      token: autorizacion?.replace(/^Bearer /, '') ?? null,
    };
    peticiones.push(peticion);

    const clave = `${metodo} ${ruta}`;
    if (!peticion.token && !PUBLICAS.includes(clave)) return json(401, { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Inicia sesión' } });
    const encontrada = Object.entries(rutas).find(([patron]) => coincide(patron, clave))?.[1];
    if (!encontrada) return json(404, { error: { codigo: 'NO_ENCONTRADO', mensaje: `Sin simular: ${clave}` } });
    const { estado = 200, cuerpo, cabeceras } = typeof encontrada === 'function' ? encontrada(peticion) : encontrada;
    return json(estado, cuerpo, cabeceras);
  }));
  return { peticiones };
}

function coincide(patron: string, clave: string): boolean {
  const expresion = patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]+/g, '[^/]+');
  return new RegExp(`^${expresion}$`).test(clave);
}

function json(estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}): Response {
  const sinCuerpo = estado === 204 || cuerpo === undefined;
  return new Response(sinCuerpo ? null : JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json', ...cabeceras },
  });
}

/** Una sesión como la que devuelve POST /auth/login. */
export function sesionDe(rol: Rol, token = `token-${rol}`): SesionIniciada {
  return {
    token,
    expiraEn: new Date(Date.now() + 8 * 3600_000).toISOString(),
    usuario: { id: `id-${rol}`, nombre: `Persona ${rol}`, email: `${rol}@ejemplo.pe`, rol, dni: null },
    empresa: rol === 'master' ? null : { id: 'empresa-a', nombre: 'Textiles Andinos SAC' },
  };
}

/** Deja una sesión guardada en el navegador, como si se hubiera iniciado antes de recargar. */
export function guardarSesion(sesion: SesionIniciada): void {
  localStorage.setItem('gestion-documental.sesion', JSON.stringify(sesion));
}

export const paginaVacia = { datos: [], paginacion: { pagina: 1, porPagina: 20, total: 0 } };

export const CATEGORIAS = {
  datos: [
    { id: 'cat-contratos', nombre: 'Contratos', descripcion: null, activa: true, documentos: 1 },
    { id: 'cat-facturas', nombre: 'Facturas y boletas', descripcion: null, activa: true, documentos: 0 },
  ],
};
