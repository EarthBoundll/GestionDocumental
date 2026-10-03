import type pg from 'pg';
import { esquemaClaveNueva, hashearClave, problemaDeClaveDelMaster } from '../../compartido/claves.js';
import { z } from '../../compartido/validacion.js';
import { conTransaccion } from '../../db/transaccion.js';
import { registrarAccion, SIN_AUTOR } from '../historial/historial.registro.js';
import { dni, email, nombre } from '../usuarios/usuarios.esquemas.js';
import { buscarCuentaPorEmail, buscarMaster, insertarMaster } from './auth.repositorio.js';

/**
 * Los datos del Master salen de variables de entorno (CLAUDE.md v2) y nunca del código. Se validan
 * aquí con las mismas reglas que la API, más las de su contraseña.
 */
const esquemaMaster = z
  .object({
    MASTER_EMAIL: email,
    MASTER_NOMBRE: nombre,
    MASTER_DNI: z.preprocess((valor) => (valor === undefined ? null : valor), dni),
    MASTER_PASSWORD: esquemaClaveNueva,
  })
  .superRefine((datos, contexto) => {
    const problema = problemaDeClaveDelMaster(datos.MASTER_PASSWORD, { email: datos.MASTER_EMAIL, dni: datos.MASTER_DNI });
    if (problema) contexto.addIssue({ code: 'custom', path: ['MASTER_PASSWORD'], message: problema });
  });

export type ResultadoMaster = { creado: true; id: string } | { creado: false; motivo: string };

/** Lee y valida los datos del Master. Si algo no sirve, lo dice sin repetir ningún valor. */
export function leerDatosDelMaster(variables: Record<string, string | undefined>) {
  const resultado = esquemaMaster.safeParse(variables);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((problema) => `  - ${problema.path.join('.')}: ${problema.message}`);
    throw new Error(`Datos del Master inválidos:\n${problemas.join('\n')}`);
  }
  const { MASTER_EMAIL, MASTER_NOMBRE, MASTER_DNI, MASTER_PASSWORD } = resultado.data;
  return { email: MASTER_EMAIL, nombre: MASTER_NOMBRE, dni: MASTER_DNI, clave: MASTER_PASSWORD };
}

/**
 * Crea la cuenta del Master una sola vez. Si ya existe, no hace nada: ni cambia su contraseña ni sus
 * datos, para que volver a ejecutar el script nunca sea peligroso. La base, además, rechaza un segundo
 * Master (usuarios_un_solo_master).
 */
export async function crearMaster(
  pool: pg.Pool,
  datos: { email: string; nombre: string; dni: string | null; clave: string },
): Promise<ResultadoMaster> {
  if (await buscarMaster(pool)) return { creado: false, motivo: 'El Master ya existe: no se ha cambiado nada' };
  if (await buscarCuentaPorEmail(pool, datos.email)) {
    return { creado: false, motivo: 'Ese correo ya pertenece a otra cuenta: el Master necesita uno propio' };
  }
  const claveHash = await hashearClave(datos.clave);
  return conTransaccion(pool, async (cliente) => {
    const master = await insertarMaster(cliente, { nombre: datos.nombre, email: datos.email, dni: datos.dni, claveHash });
    await registrarAccion(cliente, {
      accion: 'USUARIO_CREADO',
      autor: SIN_AUTOR,
      contexto: { userAgent: null, esMovil: false },
      entidad: { tipo: 'usuario', id: master.id },
      detalle: { rol: 'master', origen: 'script de inicialización' },
    });
    return { creado: true, id: master.id };
  });
}
