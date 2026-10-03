import type { RequestHandler } from 'express';
import type pg from 'pg';
import { noAutenticado } from '../compartido/errores.js';
import type { Firmador } from '../compartido/tokens.js';
import { accesoDe } from '../db/acceso.js';
import { buscarSesionVigente } from '../modulos/auth/auth.repositorio.js';

const PREFIJO = 'Bearer ';

/**
 * Exige un token válido y una sesión vigente (docs/02-arquitectura.md §4.1), y decide con qué acceso a
 * los datos trabaja la petición. La firma descarta los tokens manipulados o caducados sin tocar la base;
 * la consulta descarta las sesiones cerradas, los usuarios desactivados y las empresas desactivadas, y
 * trae el rol y la empresa vigentes, no los que había al iniciar sesión (decisión C).
 */
export function crearAutenticar(pool: pg.Pool, firmador: Firmador): RequestHandler {
  return async (req, _res, next) => {
    const cabecera = req.get('authorization');
    if (!cabecera?.startsWith(PREFIJO)) throw noAutenticado();

    const credencial = await firmador.verificar(cabecera.slice(PREFIJO.length));
    if (!credencial) throw noAutenticado();

    const usuario = await buscarSesionVigente(pool, credencial);
    // La empresa de una cuenta no cambia nunca: si la del token no es la de la base, el token no es de fiar.
    // El rol sí puede cambiar, y manda el de la base desde la petición siguiente (RN05).
    if (!usuario || usuario.empresaId !== credencial.empresaId) throw noAutenticado();

    req.autenticacion = { sesionId: credencial.sesionId, usuario };
    // La empresa sale de aquí, de la identidad, y nunca de lo que envía el cliente (CLAUDE.md v2).
    req.datos = accesoDe(pool, usuario);
    next();
  };
}
