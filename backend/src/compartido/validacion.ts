import { z } from 'zod';

// Los mensajes de Zod llegan al usuario en `detalles`, así que se generan en español. Todo el
// código importa `z` desde aquí, para que el idioma no dependa del orden en que se carguen los módulos.
z.config(z.locales.es());

/**
 * Un campo de formulario o de la URL que llega vacío («?categoriaId=») cuenta como no enviado. Sin
 * esto, un filtro que el usuario dejó en blanco se rechazaría por no tener forma de id o de fecha.
 */
export const sinVacios = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((valor) => (valor === '' ? undefined : valor), esquema);

export { z };
