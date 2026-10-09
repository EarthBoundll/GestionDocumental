import { z } from '../../compartido/validacion.js';
import { problemaDeColor } from './identidad.color.js';

// Vacío equivale a quitarlo: la empresa vuelve al nombre de siempre, al color de la plataforma o al fondo neutro.
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

/**
 * Del color de fondo solo cuenta el tono: la interfaz fija la claridad en el modo claro y en el oscuro (D39),
 * así que cualquier color deja el texto igual de legible y no hay contraste que validar.
 */
export const colorFondo = z.preprocess(
  vacioEsNulo,
  z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/, 'Usa un color en formato #f1e4c8').nullable(),
);

export const esquemaIdentidad = z
  .object({ nombreComercial: nombreComercial.optional(), colorPrimario: colorPrimario.optional(), colorFondo: colorFondo.optional() })
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), 'Indica al menos un cambio');

export type CambiosIdentidad = z.infer<typeof esquemaIdentidad>;
