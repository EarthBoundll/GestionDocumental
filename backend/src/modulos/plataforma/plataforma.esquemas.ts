import { esquemaClaveNueva } from '../../compartido/claves.js';
import { z } from '../../compartido/validacion.js';
import { dni, emailDeCuenta, nombre } from '../usuarios/usuarios.esquemas.js';

const nombreEmpresa = z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(150);
// Vacío equivale a no tenerlo.
const ruc = z.preprocess(
  (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor),
  z.string().trim().regex(/^\d{11}$/, 'El RUC tiene 11 dígitos').nullable(),
);

const alMenosUnCambio = (cambios: Record<string, unknown>) => Object.values(cambios).some((valor) => valor !== undefined);

/** Sin contraseña: la define al aceptar su invitación (D41). */
export const esquemaNuevoAdministrador = z.object({ nombre, email: emailDeCuenta, dni: dni.optional() });

/** Una empresa nace con su primer administrador: sin él, nadie podría entrar en ella (decisión B). */
export const esquemaNuevaEmpresa = z.object({
  empresa: z.object({ nombre: nombreEmpresa, ruc: ruc.optional() }),
  administrador: esquemaNuevoAdministrador,
});

export const esquemaCambiosEmpresa = z
  .object({ nombre: nombreEmpresa.optional(), ruc: ruc.optional() })
  .refine(alMenosUnCambio, 'Indica al menos un cambio');

export const esquemaEstadoEmpresa = z.object({ activa: z.boolean() });

export const esquemaCambiosAdministrador = z
  .object({ nombre: nombre.optional(), email: emailDeCuenta.optional(), dni: dni.optional(), clave: esquemaClaveNueva.optional() })
  .refine(alMenosUnCambio, 'Indica al menos un cambio');

export const esquemaEstadoAdministrador = z.object({ activo: z.boolean() });

export type NuevaEmpresa = z.infer<typeof esquemaNuevaEmpresa>;
export type NuevoAdministrador = z.infer<typeof esquemaNuevoAdministrador>;
export type CambiosEmpresa = z.infer<typeof esquemaCambiosEmpresa>;
export type CambiosAdministrador = z.infer<typeof esquemaCambiosAdministrador>;
