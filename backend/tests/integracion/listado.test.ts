import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';
import { crearSolicitud } from '../apoyo/datos.js';

describe('Listado documental en CSV (RF35)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());
  beforeEach(() => {
    app = crearAppDePruebas(pool);
  });

  const exportar = (token: string, query = '') =>
    request(app).get(`/api/v1/documentos/exportar${query}`).set('Authorization', `Bearer ${token}`);
  const lineas = (csv: string) => csv.slice(1).trim().split('\r\n');

  /** Una empresa con sus categorías iniciales y una persona que sube; devuelve cómo crear documentos en ella. */
  async function empresaConDocumentos() {
    const sesion = await registrarEmpresa(app);
    const { rows } = await pool.query<{ id: string; nombre: string }>('SELECT id, nombre FROM categorias WHERE empresa_id = $1', [sesion.empresa.id]);
    const categoria = (nombre: string) => rows.find((fila) => fila.nombre === nombre)!.id;
    const documento = async (nombre: string, categoriaNombre: string, fecha: string, eliminado = false) => {
      const { rows: [fila] } = await pool.query<{ id: string }>(
        `INSERT INTO documentos (empresa_id, categoria_id, subido_por, nombre, fecha_documento, archivo_nombre_original,
           archivo_ruta, archivo_tipo_mime, archivo_peso_bytes, eliminado_en, eliminado_por)
         VALUES ($1::uuid, $2, $3, $4, $5, 'archivo.pdf', $1::text || '/' || gen_random_uuid() || '.pdf', 'application/pdf', 2048,
                 CASE WHEN $6::boolean THEN now() END, CASE WHEN $6::boolean THEN $3::uuid END)
         RETURNING id`,
        [sesion.empresa.id, categoria(categoriaNombre), sesion.usuario.id, nombre, fecha, eliminado],
      );
      return fila!.id;
    };
    return { ...sesion, categoria, documento };
  }

  it('el administrador exporta el inventario por categoría y fecha, con su estado de aprobación, y queda registrado', async () => {
    const a = await empresaConDocumentos();
    const contrato = await a.documento('Contrato de alquiler', 'Contratos', '2026-03-01');
    await a.documento('Factura 001', 'Facturas y boletas', '2026-01-10');
    await a.documento('Factura 002', 'Facturas y boletas', '2025-12-01');
    await a.documento('=HYPERLINK("http://x.pe")', 'Otros', '2026-02-02');
    await a.documento('Borrador eliminado', 'Otros', '2026-02-03', true);
    await crearSolicitud(pool, { empresaId: a.empresa.id, documentoId: contrato, solicitanteId: a.usuario.id });
    const b = await empresaConDocumentos();
    await b.documento('Secreto de B', 'Contratos', '2026-01-01');

    const respuesta = await exportar(a.token);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(respuesta.headers['content-disposition']).toMatch(/^attachment; filename="listado-documental-\d{4}-\d{2}-\d{2}\.csv"$/);
    const [encabezado, ...filas] = lineas(respuesta.text);
    expect(encabezado).toBe('id,nombre,categoria,fecha_documento,descripcion,subido_por,subido_en_lima,tipo,peso_bytes,version_vigente,estado_aprobacion,version_revisada');
    // Como un inventario: por categoría y, dentro, por fecha. Lo eliminado y lo de otra empresa no está.
    expect(filas.map((fila) => fila.split(',')[1])).toEqual(['Contrato de alquiler', 'Factura 002', 'Factura 001', '"\'=HYPERLINK(""http://x.pe"")"']);
    expect(filas[0]).toMatch(new RegExp(`^${contrato},Contrato de alquiler,Contratos,2026-03-01,,${a.usuario.nombre},\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2},PDF,2048,1,pendiente,1$`));
    expect(filas[1]).toMatch(/,sin solicitud,$/);
    expect(respuesta.text).not.toContain('Secreto de B');
    expect((await historialDe(pool, a.empresa.id)).at(-1)).toMatchObject({
      accion: 'LISTADO_EXPORTADO', usuario_id: a.usuario.id, detalle: { filtros: {}, filas: 4 },
    });
  });

  it('se filtra como la búsqueda: nombre sin tildes, categoría y fechas', async () => {
    const a = await empresaConDocumentos();
    await a.documento('Guía de remisión 15', 'Facturas y boletas', '2026-01-10');
    await a.documento('Guía de remisión 16', 'Facturas y boletas', '2025-11-10');
    await a.documento('Factura 003', 'Facturas y boletas', '2026-01-11');

    const respuesta = await exportar(a.token, `?q=guia&categoriaId=${a.categoria('Facturas y boletas')}&desde=2026-01-01`);

    expect(lineas(respuesta.text).slice(1).map((fila) => fila.split(',')[1])).toEqual(['Guía de remisión 15']);
    expect((await historialDe(pool, a.empresa.id)).at(-1)?.detalle).toEqual({
      filtros: { q: 'guia', categoriaId: a.categoria('Facturas y boletas'), desde: '2026-01-01' }, filas: 1,
    });
    expect((await exportar(a.token, '?desde=2026-02-01&hasta=2026-01-01')).status).toBe(400);
  });

  it('un usuario no exporta el inventario: 403 registrado (indicador 6)', async () => {
    const a = await empresaConDocumentos();
    const empleado = await crearUsuarioEn(pool, a.empresa.id);

    const respuesta = await exportar(await iniciarSesion(app, empleado.email));

    expect(respuesta.status).toBe(403);
    expect((await historialDe(pool, a.empresa.id)).at(-1)).toMatchObject({
      accion: 'ACCESO_DENEGADO', usuario_id: empleado.id, detalle: { permiso: 'EXPORTAR_LISTADO' },
    });
  });

  it('más de 50.000 documentos no salen cortados: pide filtrar, y no registra la exportación', async () => {
    const a = await empresaConDocumentos();
    await pool.query(
      `INSERT INTO documentos (empresa_id, categoria_id, subido_por, nombre, fecha_documento, archivo_nombre_original,
         archivo_ruta, archivo_tipo_mime, archivo_peso_bytes)
       SELECT $1::uuid, $2::uuid, $3::uuid, 'Masivo ' || n, '2026-01-01', 'm.pdf', $1::text || '/masivo-' || n, 'application/pdf', 100
       FROM generate_series(1, 50001) AS n`,
      [a.empresa.id, a.categoria('Otros'), a.usuario.id],
    );

    const respuesta = await exportar(a.token);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.mensaje).toMatch(/pasa de 50,000 documentos: filtra por categoría o por fechas/);
    expect((await historialDe(pool, a.empresa.id)).at(-1)?.accion).not.toBe('LISTADO_EXPORTADO');
  }, 60_000);
});
