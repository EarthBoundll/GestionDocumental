import { esquemaPaginacion } from '../../compartido/paginacion.js';
import { GRUPOS_DE_TIPO, type GrupoDeTipo } from '../../compartido/tipos-de-archivo.js';
import { sinVacios, z } from '../../compartido/validacion.js';

const nombre = z.string().trim().min(2, 'Escribe al menos 2 caracteres').max(200);
const categoriaId = z.uuid('Elige una categoría');
const fecha = z.iso.date('Usa el formato AAAA-MM-DD');
const descripcion = z.string().trim().max(1000).transform((texto) => texto || null);

export const esquemaNuevoDocumento = z.object({
  nombre,
  categoriaId,
  fechaDocumento: fecha,
  descripcion: sinVacios(descripcion.optional()),
});

export const esquemaCambiosDocumento = z
  .object({
    nombre: nombre.optional(),
    categoriaId: categoriaId.optional(),
    fechaDocumento: fecha.optional(),
    descripcion: descripcion.nullable().optional(),
  })
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), 'Indica al menos un cambio');

/** El estado de aprobación según su última solicitud (D42); «sin_solicitud» si nunca se pidió. */
export const ESTADOS_DE_APROBACION = ['sin_solicitud', 'pendiente', 'aprobada', 'rechazada'] as const;

const filtros = {
  q: sinVacios(z.string().trim().max(200).optional()),
  categoriaId: sinVacios(categoriaId.optional()),
  desde: sinVacios(fecha.optional()),
  hasta: sinVacios(fecha.optional()),
  tipo: sinVacios(z.enum(Object.keys(GRUPOS_DE_TIPO) as [GrupoDeTipo, ...GrupoDeTipo[]], 'Elige PDF, imagen, Word o Excel').optional()),
  estado: sinVacios(z.enum(ESTADOS_DE_APROBACION, 'Elige sin solicitud, pendiente, aprobada o rechazada').optional()),
  subidoPor: sinVacios(z.uuid('Elige una persona').optional()),
  /** A qué fecha se aplican «desde» y «hasta»: la del documento (por defecto) o la de su subida. */
  fechaDe: sinVacios(z.enum(['documento', 'subida'], 'Elige la fecha del documento o la de subida').default('documento')),
};

const fechasEnOrden = (filtros: { desde?: string | undefined; hasta?: string | undefined }) =>
  !filtros.desde || !filtros.hasta || filtros.desde <= filtros.hasta;
const errorDeFechas = { path: ['hasta'], message: 'Debe ser igual o posterior a la fecha «desde»' };

/** Sin orden elegido, con texto se ordena por relevancia y sin él, lo más reciente primero. */
export const esquemaBusqueda = esquemaPaginacion
  .extend({ ...filtros, orden: sinVacios(z.enum(['relevancia', 'recientes', 'fecha', 'nombre']).optional()) })
  .refine(fechasEnOrden, errorDeFechas);

/** Las sugerencias mientras se escribe (D42): desde dos letras. */
export const esquemaSugerencias = z.object({ q: z.string().trim().min(2, 'Escribe al menos 2 letras').max(200) });

/** Quien eligió una sugerencia: esa búsqueda sí queda en el historial (D36, D42). */
export const esquemaSugerenciaElegida = z.object({
  q: z.string().trim().min(1, 'Falta lo que se buscó').max(200),
  documentoId: z.uuid('Indica el documento elegido'),
});

/** RF35: el listado documental se filtra igual que la búsqueda, sin páginas: sale entero. */
export const esquemaFiltrosDelListado = z.object(filtros).refine(fechasEnOrden, errorDeFechas);

export const esquemaModoArchivo = z.object({
  modo: sinVacios(z.enum(['ver', 'descargar']).default('ver')),
  /** Una versión anterior (RF34); sin ella, la vigente. */
  version: sinVacios(z.coerce.number().int().min(1).optional()),
});

export const esquemaNuevaVersion = z.object({
  comentario: sinVacios(z.string().trim().max(500, 'Como mucho 500 caracteres').optional()),
});

export const esquemaNumeroDeVersion = z.coerce.number().int('Indica el número de la versión').min(1, 'Indica el número de la versión');

export type NuevoDocumento = z.infer<typeof esquemaNuevoDocumento>;
export type CambiosDocumento = z.infer<typeof esquemaCambiosDocumento>;
export type FiltrosBusqueda = z.infer<typeof esquemaBusqueda>;
export type FiltrosDelListado = z.infer<typeof esquemaFiltrosDelListado>;
export type SugerenciaElegida = z.infer<typeof esquemaSugerenciaElegida>;
