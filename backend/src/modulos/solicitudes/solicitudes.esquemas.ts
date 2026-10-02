import { esquemaPaginacion } from '../../compartido/paginacion.js';
import { sinVacios, z } from '../../compartido/validacion.js';

const comentario = z.string().trim().max(500).transform((texto) => texto || null);

export const esquemaNuevaSolicitud = z.object({ comentario: comentario.optional() });

export const esquemaResolucion = z
  .object({
    decision: z.enum(['aprobada', 'rechazada'], 'La decisión es «aprobada» o «rechazada»'),
    comentario: comentario.optional(),
  })
  .refine((resolucion) => resolucion.decision === 'aprobada' || resolucion.comentario, {
    path: ['comentario'],
    message: 'Explica por qué la rechazas',
  });

export const esquemaFiltroSolicitudes = esquemaPaginacion.extend({
  estado: sinVacios(z.enum(['pendiente', 'aprobada', 'rechazada']).optional()),
});

export type Resolucion = z.infer<typeof esquemaResolucion>;
export type FiltroSolicitudes = z.infer<typeof esquemaFiltroSolicitudes>;
