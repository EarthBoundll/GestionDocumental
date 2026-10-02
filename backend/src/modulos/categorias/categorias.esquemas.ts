import { z } from '../../compartido/validacion.js';

const nombre = z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(80);
// Una descripción vacía es lo mismo que no tenerla.
const descripcion = z.string().trim().max(255).transform((texto) => texto || null);

export const esquemaNuevaCategoria = z.object({ nombre, descripcion: descripcion.optional() });

export const esquemaCambiosCategoria = z
  .object({ nombre: nombre.optional(), descripcion: descripcion.nullable().optional(), activa: z.boolean().optional() })
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), 'Indica al menos un cambio');

export const esquemaFiltroCategorias = z.object({ incluirInactivas: z.stringbool().default(false) });

export type NuevaCategoria = z.infer<typeof esquemaNuevaCategoria>;
export type CambiosCategoria = z.infer<typeof esquemaCambiosCategoria>;
