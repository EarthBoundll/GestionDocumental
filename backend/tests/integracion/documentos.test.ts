import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Almacenamiento } from '../../src/almacenamiento/almacenamiento.js';
import { condicionesDeBusqueda } from '../../src/modulos/documentos/documentos.repositorio.js';
import {
  almacenamientoDePruebas, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa,
  UA_IPHONE, URL_PUBLICA_DE_PRUEBAS,
} from '../apoyo/api.js';
import { DOCX, EJECUTABLE, PDF, PNG } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

type App = ReturnType<typeof crearAppDePruebas>;

describe('Documentos (RF07–RF12)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: App;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());
  beforeEach(() => {
    app = crearAppDePruebas(pool);
  });

  /** Una empresa con su administrador y un usuario, cada uno con sesión, y sus categorías. */
  async function crearEmpresa() {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id, 'usuario');
    const usuario = await iniciarSesion(app, empleado.email);
    const categorias = (await request(app).get('/api/v1/categorias').set('Authorization', `Bearer ${admin}`)).body.datos;
    const categoria = (nombre: string) => categorias.find((c: { nombre: string }) => c.nombre === nombre).id as string;
    return { admin, usuario, empleadoId: empleado.id, empresa, categoria };
  }

  function subir(token: string, campos: Record<string, string>, archivo = PDF, nombreArchivo = 'documento.pdf', userAgent?: string) {
    const peticion = request(app).post('/api/v1/documentos').set('Authorization', `Bearer ${token}`);
    if (userAgent) peticion.set('User-Agent', userAgent);
    for (const [campo, valor] of Object.entries(campos)) peticion.field(campo, valor);
    return peticion.attach('archivo', archivo, nombreArchivo);
  }

  const listar = (token: string, query: Record<string, string> = {}) =>
    request(app).get('/api/v1/documentos').query(query).set('Authorization', `Bearer ${token}`);

  describe('subir (RF07)', () => {
    it('guarda el documento y su archivo, lo registra y lo devuelve con su nombre original intacto', async () => {
      const { usuario, empresa, categoria } = await crearEmpresa();

      const respuesta = await subir(usuario, {
        nombre: '  Cotización de útiles de oficina ', categoriaId: categoria('Cotizaciones'), fechaDocumento: '2026-09-15',
      }, PDF, 'cotización-ñandú.pdf', UA_IPHONE);

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({
        nombre: 'Cotización de útiles de oficina',
        fechaDocumento: '2026-09-15',
        descripcion: null,
        categoria: { nombre: 'Cotizaciones' },
        archivo: { nombreOriginal: 'cotización-ñandú.pdf', tipoMime: 'application/pdf', pesoBytes: PDF.length },
        ultimaSolicitud: null,
      });
      expect(respuesta.body).not.toHaveProperty('archivoRuta');
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'DOCUMENTO_SUBIDO', entidad_tipo: 'documento', entidad_id: respuesta.body.id, es_movil: true,
        detalle: { nombre: 'Cotización de útiles de oficina', categoria: 'Cotizaciones', tipo: 'application/pdf' },
      });
    });

    it('acepta imágenes y Word, y rechaza un ejecutable aunque se llame «.pdf» (RN09)', async () => {
      const { usuario, categoria } = await crearEmpresa();
      const campos = { nombre: 'Archivo', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-01' };

      expect((await subir(usuario, campos, PNG, 'foto.PNG')).status).toBe(201);
      expect((await subir(usuario, campos, DOCX, 'contrato.docx')).status).toBe(201);
      const disfrazado = await subir(usuario, campos, EJECUTABLE, 'factura.pdf');
      expect(disfrazado.status).toBe(415);
      expect(disfrazado.body.error.codigo).toBe('TIPO_NO_PERMITIDO');
      expect((await subir(usuario, campos, PDF, 'notas.txt')).status).toBe(415);
    });

    it('rechaza archivos de más de 10 MB con 413', async () => {
      const { usuario, categoria } = await crearEmpresa();
      const enorme = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);

      const respuesta = await subir(usuario, { nombre: 'Enorme', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-01' }, enorme, 'enorme.pdf');

      expect(respuesta.status).toBe(413);
      expect(respuesta.body.error.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
    });

    it('sin archivo, con datos inválidos o con una categoría ajena responde 400', async () => {
      const { usuario, categoria } = await crearEmpresa();
      const otra = await crearEmpresa();

      const sinArchivo = await request(app).post('/api/v1/documentos').set('Authorization', `Bearer ${usuario}`)
        .field('nombre', 'Sin archivo').field('categoriaId', categoria('Otros')).field('fechaDocumento', '2026-09-01');
      const invalido = await subir(usuario, { nombre: 'X', categoriaId: 'no', fechaDocumento: '15/09/2026' });
      const ajena = await subir(usuario, { nombre: 'Ajena', categoriaId: otra.categoria('Otros'), fechaDocumento: '2026-09-01' });

      expect(sinArchivo.status).toBe(400);
      expect(sinArchivo.body.error.detalles).toEqual([{ campo: 'archivo', mensaje: 'Adjunta el archivo del documento' }]);
      expect(invalido.status).toBe(400);
      expect(invalido.body.error.detalles.map((d: { campo: string }) => d.campo)).toEqual(['nombre', 'categoriaId', 'fechaDocumento']);
      expect(ajena.status).toBe(400);
      expect(ajena.body.error.detalles).toEqual([{ campo: 'categoriaId', mensaje: 'La categoría no existe' }]);
    });

    it('no admite una categoría desactivada (RN08)', async () => {
      const { admin, usuario, categoria } = await crearEmpresa();
      await request(app).patch(`/api/v1/categorias/${categoria('Otros')}`).set('Authorization', `Bearer ${admin}`).send({ activa: false });

      const respuesta = await subir(usuario, { nombre: 'Algo', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-01' });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.codigo).toBe('CATEGORIA_INACTIVA');
    });

    it('si la base falla después de subir el archivo, el archivo se borra: no quedan huérfanos (§4.2)', async () => {
      const { usuario, categoria } = await crearEmpresa();
      const disco = almacenamientoDePruebas();
      const rutasSubidas: string[] = [];
      const espia: Almacenamiento = {
        subir: async (ruta, contenido, tipo) => { rutasSubidas.push(ruta); await disco.subir(ruta, contenido); void tipo; },
        firmarEnlace: (ruta, opciones) => disco.firmarEnlace(ruta, opciones),
        eliminar: vi.fn((ruta: string) => disco.eliminar(ruta)),
      };
      app = crearAppDePruebas(pool, {}, espia);
      await pool.query(`
        CREATE FUNCTION fallar_documento() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'documentos no disponibles'; END $$;
        CREATE TRIGGER documentos_rotos BEFORE INSERT ON documentos FOR EACH ROW EXECUTE FUNCTION fallar_documento();
      `);
      const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const respuesta = await subir(usuario, { nombre: 'Se pierde', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-01' });

        expect(respuesta.status).toBe(500);
        expect(rutasSubidas).toHaveLength(1);
        expect(espia.eliminar).toHaveBeenCalledWith(rutasSubidas[0]);
      } finally {
        registro.mockRestore();
        await pool.query('DROP TRIGGER documentos_rotos ON documentos; DROP FUNCTION fallar_documento();');
      }
    });
  });

  describe('buscar (RF10, indicador 2)', () => {
    async function conDocumentos() {
      const org = await crearEmpresa();
      const documentos = [
        { nombre: 'Cotización de útiles', categoriaId: org.categoria('Cotizaciones'), fechaDocumento: '2026-03-10' },
        { nombre: 'Contrato de alquiler del local', categoriaId: org.categoria('Contratos'), fechaDocumento: '2026-01-05' },
        { nombre: 'Factura 100% pagada', categoriaId: org.categoria('Facturas y boletas'), fechaDocumento: '2026-06-20' },
        { nombre: 'Boleta de compra de tóner', categoriaId: org.categoria('Facturas y boletas'), fechaDocumento: '2026-09-01' },
      ];
      for (const campos of documentos) expect((await subir(org.usuario, campos)).status).toBe(201);
      return org;
    }
    const nombres = (respuesta: request.Response) => respuesta.body.datos.map((d: { nombre: string }) => d.nombre);

    it('sin filtros lista lo más reciente primero, sin registrarlo como búsqueda', async () => {
      const { usuario, empresa } = await conDocumentos();
      const antes = (await historialDe(pool, empresa.id)).length;

      const respuesta = await listar(usuario);

      expect(respuesta.status).toBe(200);
      expect(nombres(respuesta)).toEqual(['Boleta de compra de tóner', 'Factura 100% pagada', 'Contrato de alquiler del local', 'Cotización de útiles']);
      expect(respuesta.body.paginacion).toEqual({ pagina: 1, porPagina: 20, total: 4 });
      expect((await historialDe(pool, empresa.id)).length).toBe(antes);
    });

    it('por nombre, sin importar mayúsculas ni tildes (M8), y lo registra con los filtros y el resultado', async () => {
      const { usuario, empresa } = await conDocumentos();

      const respuesta = await listar(usuario, { q: 'COTIZACION de utiles' });

      expect(nombres(respuesta)).toEqual(['Cotización de útiles']);
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'BUSQUEDA_REALIZADA', detalle: { filtros: { q: 'COTIZACION de utiles' }, resultados: 1 },
      });
    });

    it('trata «%» y «_» como texto, no como comodines', async () => {
      const { usuario } = await conDocumentos();

      expect(nombres(await listar(usuario, { q: '100%' }))).toEqual(['Factura 100% pagada']);
      expect(nombres(await listar(usuario, { q: '_' }))).toEqual([]);
    });

    it('por categoría y por rango de fechas del documento, combinables', async () => {
      const { usuario, categoria } = await conDocumentos();

      expect(nombres(await listar(usuario, { categoriaId: categoria('Facturas y boletas') })))
        .toEqual(['Boleta de compra de tóner', 'Factura 100% pagada']);
      expect(nombres(await listar(usuario, { desde: '2026-01-01', hasta: '2026-03-31', orden: 'fecha' })))
        .toEqual(['Cotización de útiles', 'Contrato de alquiler del local']);
      expect(nombres(await listar(usuario, { categoriaId: categoria('Facturas y boletas'), hasta: '2026-07-01' })))
        .toEqual(['Factura 100% pagada']);
    });

    it('ordena por nombre sin que las tildes ni las mayúsculas alteren el orden', async () => {
      const { usuario } = await conDocumentos();

      expect(nombres(await listar(usuario, { orden: 'nombre' })))
        .toEqual(['Boleta de compra de tóner', 'Contrato de alquiler del local', 'Cotización de útiles', 'Factura 100% pagada']);
    });

    it('pagina sin perder el total', async () => {
      const { usuario } = await conDocumentos();

      const segunda = await listar(usuario, { porPagina: '3', pagina: '2' });

      expect(nombres(segunda)).toEqual(['Cotización de útiles']);
      expect(segunda.body.paginacion).toEqual({ pagina: 2, porPagina: 3, total: 4 });
    });

    it('los filtros vacíos de un formulario cuentan como no enviados; los inválidos responden 400', async () => {
      const { usuario } = await conDocumentos();

      expect((await listar(usuario, { q: '', categoriaId: '', desde: '' })).body.paginacion.total).toBe(4);
      const invalido = await listar(usuario, { desde: '2026-12-01', hasta: '2026-01-01', porPagina: '500' });
      expect(invalido.status).toBe(400);
      expect(invalido.body.error.detalles.map((d: { campo: string }) => d.campo).sort()).toEqual(['hasta', 'porPagina']);
      expect((await listar(usuario, { desde: '2026-12-01', hasta: '2026-01-01' })).body.error.detalles)
        .toEqual([{ campo: 'hasta', mensaje: 'Debe ser igual o posterior a la fecha «desde»' }]);
    });

    it('nunca muestra documentos de otra empresa (RN01)', async () => {
      await conDocumentos();
      const ajena = await crearEmpresa();

      expect((await listar(ajena.usuario)).body.paginacion.total).toBe(0);
      expect((await listar(ajena.usuario, { q: 'cotizacion' })).body.datos).toEqual([]);
    });

    it('la búsqueda que hace la API usa el índice de trigramas, con el escapado incluido', async () => {
      const { empresa, categoria, empleadoId } = await conDocumentos();
      // Con un volumen realista, y sin forzar al planificador, la consulta exacta que arma el repositorio
      // debe elegir el índice. Si alguien cambiara la expresión buscada, dejaría de coincidir con la indexada.
      await pool.query(
        `INSERT INTO documentos (empresa_id, categoria_id, subido_por, nombre, fecha_documento,
           archivo_nombre_original, archivo_ruta, archivo_tipo_mime, archivo_peso_bytes)
         SELECT $1::uuid, $2::uuid, $3::uuid, 'Factura número ' || n, '2026-01-01', 'f.pdf', $1::text || '/masivo-' || n, 'application/pdf', 1000
         FROM generate_series(1, 3000) AS n`,
        [empresa.id, categoria('Otros'), empleadoId],
      );
      await pool.query('ANALYZE documentos');
      const { where, parametros } = condicionesDeBusqueda(empresa.id, { q: 'cotizacion' });

      const plan = await pool.query(`EXPLAIN SELECT d.id FROM documentos d WHERE ${where}`, parametros);

      expect(plan.rows.map((fila) => fila['QUERY PLAN']).join('\n')).toContain('documentos_nombre_trigramas');
    });
  });

  describe('ficha, edición y eliminación (RF08, RF09)', () => {
    async function conUnDocumento() {
      const org = await crearEmpresa();
      const { body: documento } = await subir(org.usuario, { nombre: 'Contrato', categoriaId: org.categoria('Contratos'), fechaDocumento: '2026-09-15', descripcion: 'Firmado' });
      const otroEmpleado = await crearUsuarioEn(pool, org.empresa.id, 'usuario');
      const otro = await iniciarSesion(app, otroEmpleado.email);
      return { ...org, documento, otro, otroId: otroEmpleado.id };
    }
    const ficha = (token: string, id: string) => request(app).get(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`);
    const editar = (token: string, id: string, cambios: object) =>
      request(app).patch(`/api/v1/documentos/${id}`).set('Authorization', `Bearer ${token}`).send(cambios);

    it('la ficha dice a cada uno qué puede hacer con el documento (D8)', async () => {
      const { usuario, admin, otro, documento } = await conUnDocumento();

      expect((await ficha(usuario, documento.id)).body.permisos).toEqual({ editar: true, eliminar: true, solicitarAprobacion: true, resolverSolicitud: false });
      expect((await ficha(admin, documento.id)).body.permisos).toEqual({ editar: true, eliminar: true, solicitarAprobacion: false, resolverSolicitud: false });
      expect((await ficha(otro, documento.id)).body.permisos).toEqual({ editar: false, eliminar: false, solicitarAprobacion: false, resolverSolicitud: false });
    });

    it('el propietario edita y queda registrado solo lo que cambió, antes y después', async () => {
      const { usuario, empresa, documento, categoria } = await conUnDocumento();

      const respuesta = await editar(usuario, documento.id, { nombre: 'Contrato de alquiler', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-15' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({ nombre: 'Contrato de alquiler', categoria: { nombre: 'Otros' }, fechaDocumento: '2026-09-15' });
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'DOCUMENTO_EDITADO',
        detalle: { cambios: {
          nombre: { antes: 'Contrato', despues: 'Contrato de alquiler' },
          categoriaId: { antes: categoria('Contratos'), despues: categoria('Otros') },
        } },
      });
      const { detalle } = (await historialDe(pool, empresa.id)).at(-1);
      expect(Object.keys(detalle.cambios)).toEqual(['nombre', 'categoriaId']);
    });

    it('un administrador puede editar el de otro; otro usuario recibe 403 y queda registrado (indicador 6)', async () => {
      const { admin, otro, otroId, empresa, documento } = await conUnDocumento();

      expect((await editar(admin, documento.id, { descripcion: 'Revisado' })).status).toBe(200);
      const denegado = await editar(otro, documento.id, { nombre: 'Intento' });

      expect(denegado.status).toBe(403);
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'ACCESO_DENEGADO', usuario_id: otroId, rol_usuario: 'usuario', entidad_id: documento.id,
        detalle: { permiso: 'GESTIONAR_CUALQUIER_DOCUMENTO', operacion: 'EDITAR_DOCUMENTO' },
      });
    });

    it('enviar los mismos valores no es un cambio: no se registra nada', async () => {
      const { usuario, empresa, documento } = await conUnDocumento();
      const antes = (await historialDe(pool, empresa.id)).length;

      expect((await editar(usuario, documento.id, { nombre: 'Contrato' })).status).toBe(200);
      expect((await historialDe(pool, empresa.id)).length).toBe(antes);
    });

    it('eliminar es lógico: desaparece de las búsquedas y de la ficha, y queda registrado (RN10)', async () => {
      const { usuario, empresa, documento } = await conUnDocumento();

      const respuesta = await request(app).delete(`/api/v1/documentos/${documento.id}`).set('Authorization', `Bearer ${usuario}`);

      expect(respuesta.status).toBe(204);
      expect((await ficha(usuario, documento.id)).status).toBe(404);
      expect((await listar(usuario)).body.paginacion.total).toBe(0);
      const { rows } = await pool.query('SELECT eliminado_en IS NOT NULL AS eliminado FROM documentos WHERE id = $1', [documento.id]);
      expect(rows).toEqual([{ eliminado: true }]);
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'DOCUMENTO_ELIMINADO', entidad_id: documento.id });
    });

    it('no se elimina con una solicitud pendiente (RN11)', async () => {
      const { usuario, empresa, documento, empleadoId } = await conUnDocumento();
      await pool.query('INSERT INTO solicitudes (empresa_id, documento_id, solicitante_id) VALUES ($1, $2, $3)',
        [empresa.id, documento.id, empleadoId]);

      const respuesta = await request(app).delete(`/api/v1/documentos/${documento.id}`).set('Authorization', `Bearer ${usuario}`);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error.codigo).toBe('DOCUMENTO_EN_REVISION');
      expect((await ficha(usuario, documento.id)).body.permisos.eliminar).toBe(false);
    });

    it('un documento de otra empresa, o un id sin sentido, responden 404', async () => {
      const { documento } = await conUnDocumento();
      const ajena = await crearEmpresa();

      expect((await ficha(ajena.admin, documento.id)).status).toBe(404);
      expect((await editar(ajena.admin, documento.id, { nombre: 'Ajeno' })).status).toBe(404);
      expect((await ficha(ajena.admin, 'no-es-un-id')).status).toBe(404);
    });
  });

  describe('ver y descargar (RF11, indicadores 2 y 3)', () => {
    it('entrega un enlace firmado de 5 minutos, lo registra, y el enlace sirve el archivo', async () => {
      const { usuario, empresa, categoria } = await crearEmpresa();
      const { body: documento } = await subir(usuario, { nombre: 'Factura', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-01' }, PDF, 'factura junio.pdf');

      const descarga = await request(app).get(`/api/v1/documentos/${documento.id}/archivo?modo=descargar`).set('Authorization', `Bearer ${usuario}`);
      const ver = await request(app).get(`/api/v1/documentos/${documento.id}/archivo`).set('Authorization', `Bearer ${usuario}`);

      expect(descarga.status).toBe(200);
      expect(descarga.body.url.startsWith(`${URL_PUBLICA_DE_PRUEBAS}/api/v1/archivos/`)).toBe(true);
      expect(new Date(descarga.body.expiraEn).getTime() - Date.now()).toBeGreaterThan(290_000);
      const historial = await historialDe(pool, empresa.id);
      expect(historial.slice(-2)).toMatchObject([
        { accion: 'DOCUMENTO_DESCARGADO', entidad_id: documento.id, detalle: { nombre: 'Factura' } },
        { accion: 'DOCUMENTO_VISUALIZADO', entidad_id: documento.id, detalle: { nombre: 'Factura' } },
      ]);

      const archivo = await request(app).get(descarga.body.url.replace(URL_PUBLICA_DE_PRUEBAS, '')).buffer(true);
      expect(archivo.status).toBe(200);
      expect(archivo.headers['content-type']).toBe('application/pdf');
      expect(archivo.headers['content-disposition']).toBe(`attachment; filename*=UTF-8''${encodeURIComponent('factura junio.pdf')}`);
      expect(Buffer.from(archivo.body)).toEqual(PDF);
      const enLinea = await request(app).get(ver.body.url.replace(URL_PUBLICA_DE_PRUEBAS, ''));
      expect(enLinea.headers['content-disposition']).toBe('inline');
    });

    it('un enlace manipulado no sirve el archivo', async () => {
      const { usuario, categoria } = await crearEmpresa();
      const { body: documento } = await subir(usuario, { nombre: 'Factura', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-01' });
      const { body } = await request(app).get(`/api/v1/documentos/${documento.id}/archivo`).set('Authorization', `Bearer ${usuario}`);
      const ruta = body.url.replace(URL_PUBLICA_DE_PRUEBAS, '');

      expect((await request(app).get(ruta.replace(/expira=\d+/, 'expira=9999999999'))).status).toBe(403);
      expect((await request(app).get(ruta.replace(/firma=[^&]+/, 'firma=falsa'))).status).toBe(403);
    });

    it('si la descarga no se puede registrar, no se entrega el enlace (RN16)', async () => {
      const { usuario, categoria } = await crearEmpresa();
      const { body: documento } = await subir(usuario, { nombre: 'Factura', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-01' });
      await pool.query(`
        CREATE FUNCTION fallar_registro() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'historial no disponible'; END $$;
        CREATE TRIGGER historial_roto BEFORE INSERT ON historial FOR EACH ROW
          WHEN (NEW.accion = 'DOCUMENTO_DESCARGADO') EXECUTE FUNCTION fallar_registro();
      `);
      const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const respuesta = await request(app).get(`/api/v1/documentos/${documento.id}/archivo?modo=descargar`).set('Authorization', `Bearer ${usuario}`);

        expect(respuesta.status).toBe(500);
        expect(respuesta.body).not.toHaveProperty('url');
      } finally {
        registro.mockRestore();
        await pool.query('DROP TRIGGER historial_roto ON historial; DROP FUNCTION fallar_registro();');
      }
    });
  });

  describe('tiempo de respuesta del listado (RF12, indicador 7)', () => {
    it('cada listado guarda su duración en el servidor y el navegador puede completar la suya una sola vez', async () => {
      const { usuario, categoria } = await crearEmpresa();
      await subir(usuario, { nombre: 'Algo', categoriaId: categoria('Otros'), fechaDocumento: '2026-09-01' });

      const respuesta = await listar(usuario, { q: 'algo' }).set('User-Agent', UA_IPHONE);
      const id = respuesta.body.tiempoRespuestaId;
      const completar = (token: string, cuerpo: object) =>
        request(app).patch(`/api/v1/tiempos-respuesta/${id}`).set('Authorization', `Bearer ${token}`).send(cuerpo);

      const { rows: [medicion] } = await pool.query('SELECT * FROM tiempos_respuesta WHERE id = $1', [id]);
      expect(medicion).toMatchObject({ operacion: 'LISTAR_DOCUMENTOS', con_filtros: true, total_resultados: 1, es_movil: true, duracion_cliente_ms: null });
      expect(medicion.duracion_servidor_ms).toBeGreaterThanOrEqual(0);

      expect((await completar(usuario, { duracionClienteMs: -1 })).status).toBe(400);
      expect((await completar(usuario, { duracionClienteMs: 348 })).status).toBe(204);
      expect((await completar(usuario, { duracionClienteMs: 999 })).status).toBe(404);
      const { rows: [completada] } = await pool.query('SELECT duracion_cliente_ms FROM tiempos_respuesta WHERE id = $1', [id]);
      expect(completada.duracion_cliente_ms).toBe(348);
    });

    it('nadie puede completar la medición de otra persona', async () => {
      const { usuario } = await crearEmpresa();
      const ajena = await crearEmpresa();
      const { body } = await listar(usuario);

      const respuesta = await request(app).patch(`/api/v1/tiempos-respuesta/${body.tiempoRespuestaId}`)
        .set('Authorization', `Bearer ${ajena.usuario}`).send({ duracionClienteMs: 100 });

      expect(respuesta.status).toBe(404);
    });
  });
});
