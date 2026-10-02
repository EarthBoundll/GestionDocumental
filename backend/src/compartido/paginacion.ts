import { z } from './validacion.js';

export const esquemaPaginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export type Paginacion = z.infer<typeof esquemaPaginacion>;

export interface Pagina<T> {
  datos: T[];
  paginacion: Paginacion & { total: number };
}

export function desplazamiento({ pagina, porPagina }: Paginacion): number {
  return (pagina - 1) * porPagina;
}
