import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { arrancarPostgresDesechable, type PostgresDesechable } from '../../backend/scripts/postgres-desechable.js';
import { aplicarMigraciones } from '../../backend/src/db/migraciones.js';
import { crearPool } from '../../backend/src/db/pool.js';
import { crearAppDePruebas, registrarEmpresa } from '../../backend/tests/apoyo/api.js';
import type { Documento } from './corpus.js';

const MIGRACIONES = fileURLToPath(new URL('../../backend/migraciones', import.meta.url));
/** Las búsquedas se miden en los cinco primeros: lo que muestran las sugerencias y lo que se ve sin desplazarse en el celular. */
export const PRIMEROS = 5;
/** La descripción admite 1000 caracteres (documentos.esquemas.ts). */
const MAXIMO_DE_DESCRIPCION = 1000;

export interface Buscador {
  buscar(texto: string): Promise<string[]>;
}

type App = ReturnType<typeof crearAppDePruebas>;

/**
 * La búsqueda de producción (D42), con su código, sus migraciones y su RLS, en un PostgreSQL desechable. Cada
 * buscador es una empresa distinta de la misma base: la «actual» recibe los documentos como los subiría una
 * persona; la «con contenido» además lleva el texto del archivo en la descripción, que es como se vería la
 * búsqueda en el contenido (C) si el texto se extrajera al subir.
 */
export async function prepararBuscadoresActuales(corpus: Documento[]) {
  const postgres = await arrancarPostgresDesechable();
  let pool: ReturnType<typeof crearPool> | undefined;
  try {
    pool = crearPool({ DATABASE_URL: urlDe(postgres), DATABASE_CA: undefined });
    await aplicarMigraciones(pool, MIGRACIONES);
    const app = crearAppDePruebas(pool);
    const actual = await empresaCon(app, corpus, (documento) => documento.descripcion);
    const conContenido = await empresaCon(app, corpus, descripcionConTexto);
    const abierto = pool;
    return {
      actual,
      conContenido,
      async cerrar() {
        await abierto.end();
        await postgres.detener();
      },
    };
  } catch (error) {
    await pool?.end();
    await postgres.detener();
    throw error;
  }
}

function urlDe({ usuario, clave, puerto }: PostgresDesechable): string {
  return `postgresql://${usuario}:${clave}@127.0.0.1:${puerto}/postgres`;
}

function descripcionConTexto(documento: Documento): string | undefined {
  const partes = [documento.descripcion, documento.texto.replaceAll('\n', ' ')].filter(Boolean);
  return partes.join('. ').slice(0, MAXIMO_DE_DESCRIPCION) || undefined;
}

/** Una empresa nueva con todo el corpus subido por la API; devuelve su buscador, que traduce ids a claves. */
async function empresaCon(app: App, corpus: Documento[], descripcionDe: (documento: Documento) => string | undefined): Promise<Buscador> {
  const { token } = await registrarEmpresa(app);
  const autorizacion = { Authorization: `Bearer ${token}` };
  const categorias = await categoriasPara(app, autorizacion, corpus);
  const claveDe = new Map<string, string>();
  for (const documento of corpus) {
    const peticion = request(app).post('/api/v1/documentos').set(autorizacion)
      .field('nombre', documento.nombre)
      .field('categoriaId', categorias.get(documento.categoria)!)
      .field('fechaDocumento', documento.fecha);
    const descripcion = descripcionDe(documento);
    if (descripcion) peticion.field('descripcion', descripcion);
    const respuesta = await peticion.attach('archivo', documento.contenido, documento.archivo);
    if (respuesta.status !== 201) throw new Error(`No se subió ${documento.nombre}: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
    claveDe.set(respuesta.body.id, documento.clave);
  }
  return {
    async buscar(texto) {
      const respuesta = await request(app).get('/api/v1/documentos').query({ q: texto, porPagina: PRIMEROS }).set(autorizacion);
      if (respuesta.status !== 200) throw new Error(`La búsqueda «${texto}» falló: ${respuesta.status} ${JSON.stringify(respuesta.body)}`);
      return (respuesta.body.datos as { id: string }[]).map(({ id }) => claveDe.get(id)!);
    },
  };
}

/** Las categorías del corpus: las iniciales de toda empresa y las que falten, creadas por su administradora. */
async function categoriasPara(app: App, autorizacion: Record<string, string>, corpus: Documento[]): Promise<Map<string, string>> {
  const existentes = (await request(app).get('/api/v1/categorias').set(autorizacion)).body.datos as { id: string; nombre: string }[];
  const categorias = new Map(existentes.map(({ id, nombre }) => [nombre, id]));
  for (const nombre of new Set(corpus.map((documento) => documento.categoria))) {
    if (categorias.has(nombre)) continue;
    const creada = await request(app).post('/api/v1/categorias').set(autorizacion).send({ nombre });
    if (creada.status !== 201) throw new Error(`No se creó la categoría ${nombre}: ${creada.status}`);
    categorias.set(nombre, creada.body.id);
  }
  return categorias;
}
