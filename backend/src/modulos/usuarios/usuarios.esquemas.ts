import { esquemaClaveNueva } from '../../compartido/claves.js';
import { esquemaPaginacion } from '../../compartido/paginacion.js';
import { ROLES_DE_EMPRESA } from '../../compartido/permisos.js';
import { sinVacios, z } from '../../compartido/validacion.js';

export const nombre = z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(120);
export const email = z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido').max(254));
/** Dato del perfil, nunca una credencial (CLAUDE.md v2). Vacío equivale a no tenerlo. */
export const dni = z.preprocess(
  (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor),
  z.string().trim().regex(/^\d{8}$/, 'El DNI tiene 8 dígitos').nullable(),
);
// Dentro de una empresa no se puede crear un Master: el rol ni siquiera es una opción.
const rol = z.enum(ROLES_DE_EMPRESA, 'El rol es «administrador» o «usuario»');

export const esquemaNuevoUsuario = z.object({ nombre, email, dni: dni.optional(), clave: esquemaClaveNueva, rol });

export const esquemaCambiosUsuario = z
  .object({ nombre: nombre.optional(), dni: dni.optional(), rol: rol.optional(), clave: esquemaClaveNueva.optional() })
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), 'Indica al menos un cambio');

export const esquemaEstadoUsuario = z.object({ activo: z.boolean() });

export const esquemaFiltroUsuarios = esquemaPaginacion.extend({
  q: sinVacios(z.string().trim().max(120).optional()),
  rol: sinVacios(rol.optional()),
  activo: sinVacios(z.stringbool().optional()),
});

export type NuevoUsuario = z.infer<typeof esquemaNuevoUsuario>;
export type CambiosUsuario = z.infer<typeof esquemaCambiosUsuario>;
export type FiltroUsuarios = z.infer<typeof esquemaFiltroUsuarios>;
