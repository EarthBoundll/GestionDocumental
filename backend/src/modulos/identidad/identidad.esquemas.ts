import { z } from '../../compartido/validacion.js';
import { problemaDeColor } from './identidad.color.js';

// Vacío equivale a quitarlo: la empresa vuelve al nombre de siempre o al color de la plataforma.
const vacioEsNulo = (valor: unknown) => (typeof valor === 'string' && valor.trim() === '' ? null : valor);

export const nombreComercial = z.preprocess(
  vacioEsNulo,
  z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(60, 'Como mucho 60 caracteres').nullable(),
);

export const colorPrimario = z.preprocess(
  vacioEsNulo,
  z.string().trim().toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, 'Usa un color en formato #1f6f5c')
    .superRefine((color, contexto) => {
      const problema = problemaDeColor(color);
      if (problema) contexto.addIssue({ code: 'custom', message: problema });
    })
    .nullable(),
);

export const esquemaIdentidad = z
  .object({ nombreComercial: nombreComercial.optional(), colorPrimario: colorPrimario.optional() })
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), 'Indica al menos un cambio');

export type CambiosIdentidad = z.infer<typeof esquemaIdentidad>;
