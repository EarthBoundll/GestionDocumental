import type pg from 'pg';
import type { Rol } from '../compartido/permisos.js';
import { conTransaccion } from './transaccion.js';

/**
 * El único camino a los datos de negocio (D17, CLAUDE.md v2: «el filtrado vive en una capa
 * transversal»). Cada operación corre en una transacción que adopta un rol sin privilegios y fija la
 * empresa activa; las políticas RLS de la base hacen el resto. Aunque una consulta olvidara filtrar
 * por empresa, la base no le daría filas ajenas.
 */
export interface AccesoADatos {
  /** La empresa del ámbito, o null en el de la plataforma (el Master). */
  readonly empresaId: string | null;
  ejecutar<T>(trabajo: (db: pg.PoolClient) => Promise<T>): Promise<T>;
}

type RolDeBase = 'app_empresa' | 'app_plataforma';

/** Quién actúa: con su rol de negocio la base decide qué categorías restringidas ve (D22). */
export interface Identidad {
  usuarioId: string | null;
  rol: Rol | null;
}

const ANONIMA: Identidad = { usuarioId: null, rol: null };

function crearAcceso(pool: pg.Pool, rol: RolDeBase, empresaId: string | null, identidad: Identidad): AccesoADatos {
  return {
    empresaId,
    ejecutar: (trabajo) => conTransaccion(pool, async (cliente) => {
      // set_config(..., true) solo vale para esta transacción: al terminar, la conexión vuelve al pool limpia.
      await cliente.query(
        `SELECT set_config('role', $1, true), set_config('app.empresa_id', $2, true),
                set_config('app.usuario_id', $3, true), set_config('app.rol', $4, true)`,
        [rol, empresaId ?? '', identidad.usuarioId ?? '', identidad.rol ?? ''],
      );
      return trabajo(cliente);
    }),
  };
}

/** Lo que ven el Administrador de Empresa y el Usuario: solo su empresa, y en ella lo que pueden ver. */
export function accesoDeEmpresa(pool: pg.Pool, empresaId: string, identidad: Identidad = ANONIMA): AccesoADatos {
  return crearAcceso(pool, 'app_empresa', empresaId, identidad);
}

/**
 * Lo que ve el Master: empresas, sus administradores y métricas en cifras; nunca documentos. Es la
 * excepción al aislamiento, y existe solo aquí, con nombre propio.
 */
export function accesoDePlataforma(pool: pg.Pool, identidad: Identidad = ANONIMA): AccesoADatos {
  return crearAcceso(pool, 'app_plataforma', null, identidad);
}

/**
 * El acceso que corresponde a quien inició sesión, decidido por su identidad en la base y nunca por lo
 * que envía el cliente. Aquí, y solo aquí, se aplica la excepción del Master.
 */
export function accesoDe(pool: pg.Pool, usuario: { id?: string; rol: Rol; empresaId: string | null }): AccesoADatos {
  const identidad: Identidad = { usuarioId: usuario.id ?? null, rol: usuario.rol };
  if (usuario.rol === 'master') return accesoDePlataforma(pool, identidad);
  // La base garantiza que todo usuario que no es el Master tiene empresa (usuarios_master_sin_empresa).
  if (!usuario.empresaId) throw new Error('Un usuario de empresa sin empresa: la base debía impedirlo');
  return accesoDeEmpresa(pool, usuario.empresaId, identidad);
}
