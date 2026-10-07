import { writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accesoDeEmpresa } from '../../src/db/acceso.js';
import { esquemaBusqueda } from '../../src/modulos/documentos/documentos.esquemas.js';
import { consultasDeBusqueda } from '../../src/modulos/documentos/documentos.repositorio.js';
import { crearAppDePruebas, crearUsuarioEn, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/*
 * Prueba de carga (indicador 7, RNF05): ¿el listado y la búsqueda siguen por debajo de 1 s con 50.000
 * documentos en una empresa, con categorías restringidas y otra empresa en la misma tabla? Se mide la
 * API entera (autenticación, sesión en la base, RLS, consulta y JSON), sin la red. Con
 * INFORME_CARGA=<ruta> deja su informe en Markdown (npm run informe:carga). Sin esa variable no corre:
 * cargar los datos lleva casi un minuto, demasiado para cada push.
 */

const DOCUMENTOS = 50_000;
const DOCUMENTOS_DE_OTRA_EMPRESA = 10_000;
const ASIENTOS = 200_000;
const CALENTAMIENTO = 3;
const REPETICIONES = 30;
/** RNF05: el listado, en menos de 1 s. */
const UMBRAL_MS = 1000;
/** Una exportación es una descarga del inventario entero, no un listado: se le pide que no haga esperar. */
const UMBRAL_EXPORTACION_MS = 5000;

/** El rubro del caso de validación: cada tipo de documento va a su categoría, en el mismo orden. */
const TIPOS = ['Factura', 'Boleta', 'Guía de remisión', 'Orden de compra', 'Contrato', 'Cotización', 'Planilla', 'Constancia'];
const CATEGORIAS = ['Facturas', 'Boletas', 'Guías de remisión', 'Órdenes de compra', 'Contratos', 'Cotizaciones', 'Planillas', 'Recursos humanos'];
const RESTRINGIDAS = ['Planillas', 'Recursos humanos'];
const CLIENTES = ['Textiles Andinos', 'Confecciones Lima', 'Hilos del Sur', 'Moda Gamarra', 'Telas Perú', 'Algodón Pima'];

interface Medicion {
  escenario: string;
  quien: string;
  ruta: string;
  resultados: number | null;
  umbral: number;
  mediana: number;
  p95: number;
  maximo: number;
}

const mediciones: Medicion[] = [];
const planes: { titulo: string; plan: string; ejecucion: string }[] = [];
let duracionDeCarga = 0;

describe.runIf(process.env.INFORME_CARGA)('Prueba de carga: 50.000 documentos (indicador 7)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  const a = {} as { empresaId: string; adminToken: string; usuarioId: string; usuarioToken: string; categorias: string[] };

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool);
    const inicio = performance.now();

    const sesion = await registrarEmpresa(app);
    a.empresaId = sesion.empresa.id;
    a.adminToken = sesion.token;
    a.categorias = await crearCategorias(a.empresaId, CATEGORIAS);
    const personas = [sesion.usuario.id];
    for (let i = 0; i < 9; i++) personas.push((await crearUsuarioEn(pool, a.empresaId)).id);
    // La usuaria que se mide ve una de las dos restringidas: la RLS recorre las dos ramas (D22).
    const usuaria = await crearUsuarioEn(pool, a.empresaId);
    a.usuarioId = usuaria.id;
    a.usuarioToken = await iniciarSesion(app, usuaria.email);
    await pool.query('INSERT INTO categoria_accesos (categoria_id, usuario_id, empresa_id) VALUES ($1, $2, $3)',
      [a.categorias[CATEGORIAS.indexOf('Planillas')], a.usuarioId, a.empresaId]);
    await cargarDocumentos(a.empresaId, a.categorias, personas, DOCUMENTOS);
    await cargarHistorial(a.empresaId, personas, ASIENTOS);

    // Otra empresa en las mismas tablas: lo suyo no debe pesar en las consultas de la primera.
    const otra = await registrarEmpresa(app);
    await cargarDocumentos(otra.empresa.id, await crearCategorias(otra.empresa.id, CATEGORIAS.slice(0, 3)), [otra.usuario.id],
      DOCUMENTOS_DE_OTRA_EMPRESA);

    // Como en una base en uso: las estadísticas al día, que es lo que hace el autovacuum de Supabase.
    await pool.query('VACUUM ANALYZE');
    duracionDeCarga = performance.now() - inicio;
  }, 300_000);

  afterAll(async () => {
    const ruta = process.env.INFORME_CARGA;
    if (ruta && mediciones.length > 0) await writeFile(ruta, informe());
    await base?.cerrar();
  });

  /** Las categorías del rubro, junto a las iniciales de toda empresa; si una ya existe, se usa esa. */
  async function crearCategorias(empresaId: string, nombres: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const nombre of nombres) {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO categorias (empresa_id, nombre, restringida) VALUES ($1, $2, $3)
         ON CONFLICT (empresa_id, lower(nombre)) DO UPDATE SET restringida = EXCLUDED.restringida RETURNING id`,
        [empresaId, nombre, RESTRINGIDAS.includes(nombre)],
      );
      ids.push(rows[0]!.id);
    }
    return ids;
  }

  /** Documentos de tres años y medio, con su versión 1; uno de cada 50, en la papelera. */
  async function cargarDocumentos(empresaId: string, categorias: string[], personas: string[], cantidad: number) {
    await pool.query(
      `INSERT INTO documentos (empresa_id, categoria_id, subido_por, nombre, descripcion, fecha_documento,
         archivo_nombre_original, archivo_ruta, archivo_tipo_mime, archivo_peso_bytes, creado_en, actualizado_en,
         eliminado_en, eliminado_por)
       SELECT $1::uuid, ($2::uuid[])[1 + g % cardinality($2::uuid[])], ($3::uuid[])[1 + g % cardinality($3::uuid[])],
              ($4::text[])[1 + g % cardinality($2::uuid[])] || ' ' || ($5::text[])[1 + g % cardinality($5::text[])]
                || ' N° ' || lpad(g::text, 6, '0'),
              CASE WHEN g % 3 = 0 THEN 'Documento de prueba generado para la medición de carga' END,
              date '2023-01-01' + (g * 7919) % 1370,
              'documento-' || g || '.pdf', $1::text || '/' || gen_random_uuid() || '.pdf', 'application/pdf',
              20000 + (g::bigint * 104729) % 2000000,
              now() - ($6 - g) * interval '25 minutes', now() - ($6 - g) * interval '25 minutes',
              CASE WHEN g % 50 = 0 THEN now() - interval '1 day' END,
              CASE WHEN g % 50 = 0 THEN ($3::uuid[])[1] END
       FROM generate_series(1, $6) AS g`,
      [empresaId, categorias, personas, TIPOS, CLIENTES, cantidad],
    );
    await pool.query(
      `INSERT INTO documento_versiones (empresa_id, documento_id, numero, archivo_nombre_original, archivo_ruta,
         archivo_tipo_mime, archivo_peso_bytes, subida_por, creada_en)
       SELECT empresa_id, id, 1, archivo_nombre_original, archivo_ruta, archivo_tipo_mime, archivo_peso_bytes,
              subido_por, creado_en
       FROM documentos WHERE empresa_id = $1`,
      [empresaId],
    );
  }

  /** Lo que deja un uso real: vistas, descargas y subidas sobre esos documentos, en los últimos dos años. */
  async function cargarHistorial(empresaId: string, personas: string[], cantidad: number) {
    await pool.query(
      `WITH docs AS (SELECT id, nombre, row_number() OVER (ORDER BY creado_en) AS n FROM documentos WHERE empresa_id = $1),
            gente AS (SELECT array_agg(id ORDER BY id) AS ids, array_agg(rol ORDER BY id) AS roles
                      FROM usuarios WHERE id = ANY ($2::uuid[]))
       INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion, entidad_tipo, entidad_id, detalle,
                              user_agent, es_movil, creado_en)
       SELECT $1, gente.ids[1 + g % cardinality(gente.ids)], gente.roles[1 + g % cardinality(gente.ids)],
              (ARRAY['DOCUMENTO_VISUALIZADO', 'DOCUMENTO_DESCARGADO', 'DOCUMENTO_VISUALIZADO', 'DOCUMENTO_SUBIDO'])[1 + g % 4],
              'documento', docs.id, jsonb_build_object('nombre', docs.nombre), 'Mozilla/5.0 (prueba de carga)', g % 3 = 0,
              now() - ($3 - g) * interval '5 minutes'
       FROM generate_series(1, $3) AS g
       JOIN docs ON docs.n = 1 + g % $4
       CROSS JOIN gente`,
      [empresaId, personas, cantidad, DOCUMENTOS],
    );
  }

  /** Cuántos resultados trajo: el total de la página, el de la vista imprimible o las filas del CSV. */
  function resultadosDe(respuesta: request.Response): number | null {
    if (respuesta.type === 'text/csv') return respuesta.text.trim().split('\r\n').length - 1;
    return respuesta.body?.paginacion?.total ?? respuesta.body?.total ?? null;
  }

  async function medir(escenario: string, quien: 'administradora' | 'usuaria', ruta: string,
    { repeticiones = REPETICIONES, umbral = UMBRAL_MS } = {}) {
    const token = quien === 'administradora' ? a.adminToken : a.usuarioToken;
    const pedir = () => request(app).get(ruta).set('Authorization', `Bearer ${token}`);
    for (let i = 0; i < CALENTAMIENTO; i++) await pedir();
    const tiempos: number[] = [];
    let ultima: request.Response | undefined;
    for (let i = 0; i < repeticiones; i++) {
      const inicio = performance.now();
      ultima = await pedir();
      tiempos.push(performance.now() - inicio);
      expect(ultima.status).toBe(200);
    }
    const ordenados = tiempos.toSorted((x, y) => x - y);
    const medicion: Medicion = {
      escenario,
      quien,
      ruta: ruta.replace('/api/v1', ''),
      resultados: ultima ? resultadosDe(ultima) : null,
      umbral,
      mediana: percentil(ordenados, 0.5),
      p95: percentil(ordenados, 0.95),
      maximo: ordenados.at(-1)!,
    };
    mediciones.push(medicion);
    return medicion;
  }

  /** El plan de las consultas del listado tal como las ejecuta la API: con el rol sin privilegios y su RLS. */
  async function explicar(titulo: string, usuarioId: string, rol: 'administrador' | 'usuario', consulta: Record<string, string>) {
    const filtros = esquemaBusqueda.parse(consulta);
    const { conteo, pagina } = consultasDeBusqueda(a.empresaId, filtros);
    const acceso = accesoDeEmpresa(pool, a.empresaId, { usuarioId, rol });
    for (const [parte, sql] of [['total', conteo], ['página', pagina]] as const) {
      const { rows } = await acceso.ejecutar((db) =>
        db.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${sql.texto}`, sql.parametros));
      const lineas = rows.map((fila) => fila['QUERY PLAN']);
      planes.push({ titulo: `${titulo} (${parte})`, plan: lineas.join('\n'), ejecucion: lineas.find((l) => l.startsWith('Execution Time')) ?? '' });
    }
  }

  const categoria = (nombre: string) => a.categorias[CATEGORIAS.indexOf(nombre)]!;

  it('el listado y la búsqueda responden en menos de 1 s con 50.000 documentos', async () => {
    const docs = '/api/v1/documentos';
    await medir('Listado inicial: los 20 más recientes', 'usuaria', docs);
    await medir('Listado inicial: los 20 más recientes', 'administradora', docs);
    await medir('Búsqueda por nombre, sin tildes («guia de remision»)', 'usuaria', `${docs}?q=guia%20de%20remision`);
    await medir('Búsqueda de un documento concreto («N° 031416»)', 'usuaria', `${docs}?q=031416`);
    // El 031415 es de «Recursos humanos», restringida y sin acceso para ella: con 50.000 la RLS lo sigue ocultando.
    await medir('El mismo, de una categoría restringida sin acceso («N° 031415»)', 'usuaria', `${docs}?q=031415`);
    await medir('Filtro por categoría (Facturas)', 'usuaria', `${docs}?categoriaId=${categoria('Facturas')}`);
    await medir('Filtro por categoría restringida con acceso (Planillas)', 'usuaria', `${docs}?categoriaId=${categoria('Planillas')}`);
    await medir('Filtro por fechas (un trimestre)', 'usuaria', `${docs}?desde=2025-01-01&hasta=2025-03-31`);
    await medir('Nombre, categoría y fechas a la vez', 'usuaria',
      `${docs}?q=textiles&categoriaId=${categoria('Facturas')}&desde=2024-01-01&hasta=2024-12-31`);
    await medir('Ordenado por nombre', 'usuaria', `${docs}?orden=nombre`);
    await medir('Página 500 del listado', 'usuaria', `${docs}?pagina=500`);
    await medir('Historial: primera página', 'administradora', '/api/v1/historial');
    await medir('Historial filtrado por una semana', 'administradora', '/api/v1/historial?desde=2026-01-05&hasta=2026-01-11');
    await medir('Historial imprimible: seis días enteros', 'administradora', '/api/v1/historial/impresion?desde=2026-01-05&hasta=2026-01-10',
      { repeticiones: 10, umbral: UMBRAL_EXPORTACION_MS });
    await medir('Listado documental completo en CSV', 'administradora', `${docs}/exportar`,
      { repeticiones: 5, umbral: UMBRAL_EXPORTACION_MS });

    await explicar('Listado inicial de la usuaria', a.usuarioId, 'usuario', {});
    await explicar('Búsqueda por nombre de la usuaria', a.usuarioId, 'usuario', { q: 'guia de remision' });

    for (const medicion of mediciones) expect(medicion.p95, medicion.escenario).toBeLessThan(medicion.umbral);
  }, 300_000);
});

function percentil(ordenados: number[], p: number): number {
  return ordenados[Math.min(ordenados.length - 1, Math.ceil(p * ordenados.length) - 1)]!;
}

const ms = (valor: number) => `${Math.round(valor)} ms`;

function informe(): string {
  const cumplen = mediciones.filter((m) => m.p95 < m.umbral).length;
  const fecha = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date());
  return `# Prueba de carga: 50.000 documentos

Generado por \`npm run informe:carga\` (backend) el ${fecha}, hora de Lima.

**Pregunta.** ¿El listado y la búsqueda siguen por debajo de 1 s (RNF05, indicador 7) cuando una empresa
tiene ${DOCUMENTOS.toLocaleString('es-PE')} documentos, con categorías restringidas y otra empresa en las mismas tablas?

**Resultado: ${cumplen} de ${mediciones.length} escenarios con el percentil 95 dentro de su umbral:** 1 s para listar
y buscar (RNF05) y 5 s para las dos exportaciones, que descargan de una vez todo lo filtrado.

## Los datos

- Empresa medida: ${DOCUMENTOS.toLocaleString('es-PE')} documentos de un taller textil (facturas, guías, órdenes de compra,
  planillas…) repartidos en ${CATEGORIAS.length} categorías, dos de ellas restringidas, con fechas de tres años y medio, su
  versión 1 y uno de cada 50 en la papelera; ${ASIENTOS.toLocaleString('es-PE')} asientos de historial; 11 personas.
- Otra empresa con ${DOCUMENTOS_DE_OTRA_EMPRESA.toLocaleString('es-PE')} documentos en las mismas tablas.
- Quien mide: la **usuaria** ve una de las dos categorías restringidas, así que la RLS evalúa las dos
  ramas (D22); la **administradora** las ve todas. Carga de los datos: ${Math.round(duracionDeCarga / 1000)} s.

## Cómo se mide

Cada escenario es una petición real a la API (autenticación, sesión comprobada en la base, RLS,
consulta, registro en el historial de la búsqueda y JSON), ${CALENTAMIENTO} veces para calentar y ${REPETICIONES}
medidas. No incluye la red ni el navegador: es el tiempo del servidor, la parte que crece con los datos.
Equipo: ${cpus().length} núcleos (${cpus()[0]?.model.trim()}), ${Math.round(totalmem() / 2 ** 30)} GB, Node ${process.version},
PostgreSQL 17 local.

En producción el servidor es más lento (Render gratuito comparte CPU) y se suma la red hasta Supabase y
hasta el navegador. Por eso el indicador 7 de la evaluación se mide en el navegador de cada participante
(\`docs/08-indicadores.md\` §7); esta prueba responde otra pregunta: si el volumen de datos, por sí
solo, pone en riesgo el umbral.

## Resultados

| Escenario | Quién | Resultados | Mediana | Percentil 95 | Máximo | Umbral | Cumple |
|---|---|---:|---:|---:|---:|---:|---|
${mediciones.map((m) => `| ${m.escenario} | ${m.quien} | ${m.resultados?.toLocaleString('es-PE') ?? '—'} | ${ms(m.mediana)} | ${ms(m.p95)} | ${ms(m.maximo)} | ${m.umbral / 1000} s | ${m.p95 < m.umbral ? 'Sí' : '**No**'} |`).join('\n')}

## Lo que encontró

La primera ejecución, el 7 de octubre de 2026, se hizo con la política de visibilidad de la migración 004, que
llamaba a \`puede_ver_categoria()\` en cada fila. Una función \`SECURITY DEFINER\` no se integra en la consulta,
y cada página la evaluaba dos veces por documento (para el total y para la página):

| Escenario | Con la política de la 004 (mediana) | Con la de la 010 (mediana) |
|---|---:|---:|
| Listado inicial de la usuaria | 1948 ms | ${ms(mediciones[0]?.mediana ?? 0)} |
| Listado inicial de la administradora | 925 ms | ${ms(mediciones[1]?.mediana ?? 0)} |
| Búsqueda por nombre de la usuaria | 3846 ms (\`guia remision\`) | ${ms(mediciones[2]?.mediana ?? 0)} |

La migración 010 calcula una sola vez por consulta qué categorías ve quien pregunta (\`categorias_visibles()\`, un
InitPlan) y cada fila solo se compara con esa lista; decide lo mismo que antes (D31).

Queda una limitación conocida: con la RLS activa, la búsqueda por nombre no usa el índice de trigramas, porque
\`LIKE\` no es *leakproof* y PostgreSQL no lo evalúa antes que las políticas. Recorre los documentos visibles de la
empresa con un índice por categoría: unos 0,3 s con 50.000, lejos del umbral. Si alguna vez hiciera falta, la
salida es una función que busque los identificadores con el índice dentro de la empresa activa.

## Planes de ejecución

Las mismas consultas que ejecuta la API, con el rol \`app_empresa\` y la identidad de la usuaria: es decir,
con la RLS aplicada.

${planes.map((p) => `<details>
<summary>${p.titulo}: ${p.ejecucion}</summary>

\`\`\`
${p.plan}
\`\`\`

</details>`).join('\n\n')}
`;
}
