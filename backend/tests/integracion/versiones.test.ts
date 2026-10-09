import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  almacenamientoDePruebas, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa, URL_PUBLICA_DE_PRUEBAS,
} from '../apoyo/api.js';
import { DOCX, PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';
import { insertarSolicitud } from '../../src/modulos/solicitudes/solicitudes.repositorio.js';
import { bloquearParaVersion, hacerVigente, insertarVersion } from '../../src/modulos/documentos/versiones.repositorio.js';

type App = ReturnType<typeof crearAppDePruebas>;

/**
 * Versiones de un documento (RF34, D30): una versión nueva no pisa la anterior, restaurar no retrocede,
 * y la aprobación es de una versión. Detrás, las mismas reglas de siempre: aislamiento, categorías
 * restringidas y quién puede cambiar el documento.
 */
describe('Versiones de un documento (RF34)', () => {
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

  const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });
  const ficha = (token: string, id: string) => request(app).get(`/api/v1/documentos/${id}`).set(conToken(token));
  const versiones = (token: string, id: string) => request(app).get(`/api/v1/documentos/${id}/versiones`).set(conToken(token));
  const subirVersion = (token: string, id: string, archivo = PDF, nombre = 'contrato-v2.pdf', comentario?: string) => {
    const peticion = request(app).post(`/api/v1/documentos/${id}/versiones`).set(conToken(token));
    if (comentario !== undefined) peticion.field('comentario', comentario);
    return peticion.attach('archivo', archivo, nombre);
  };
  const restaurar = (token: string, id: string, numero: number | string) =>
    request(app).post(`/api/v1/documentos/${id}/versiones/${numero}/restauracion`).set(conToken(token));

  async function subir(token: string, nombre = 'Contrato de alquiler', categoriaId?: string) {
    const categoria = categoriaId ?? (await request(app).get('/api/v1/categorias').set(conToken(token))).body.datos[0].id as string;
    const respuesta = await request(app).post('/api/v1/documentos').set(conToken(token))
      .field('nombre', nombre).field('categoriaId', categoria).field('fechaDocumento', '2026-09-01')
      .attach('archivo', PDF, 'contrato-v1.pdf');
    expect(respuesta.status).toBe(201);
    return respuesta.body.id as string;
  }

  async function escenario() {
    const { token: admin, empresa } = await registrarEmpresa(app);
    const autora = await crearUsuarioEn(pool, empresa.id);
    const companera = await crearUsuarioEn(pool, empresa.id);
    const tokenAutora = await iniciarSesion(app, autora.email);
    const tokenCompanera = await iniciarSesion(app, companera.email);
    const documentoId = await subir(tokenAutora);
    return { admin, empresa, autora: { ...autora, token: tokenAutora }, tokenCompanera, documentoId };
  }

  it('un documento nace con su versión 1, y una versión nueva se suma sin pisarla', async () => {
    const { autora, empresa, documentoId } = await escenario();
    expect((await ficha(autora.token, documentoId)).body.version).toBe(1);

    const respuesta = await subirVersion(autora.token, documentoId, DOCX, 'contrato-v2.docx', '  Corrige la cláusula 4  ');

    expect(respuesta.status).toBe(201);
    // La vigente cambia: la ficha, el listado y la descarga usan la nueva.
    expect(respuesta.body).toMatchObject({ version: 2, archivo: { nombreOriginal: 'contrato-v2.docx', tipoMime: expect.stringContaining('wordprocessingml') } });
    const lista = (await versiones(autora.token, documentoId)).body.datos;
    expect(lista.map((v: { numero: number; vigente: boolean }) => [v.numero, v.vigente])).toEqual([[2, true], [1, false]]);
    expect(lista[0]).toMatchObject({ comentario: 'Corrige la cláusula 4', subidaPor: { id: autora.id }, restauradaDe: null });
    expect(lista[1].archivo.nombreOriginal).toBe('contrato-v1.pdf');
    // Nada dice dónde está el archivo: solo se llega a él con un enlace firmado.
    expect(JSON.stringify(lista)).not.toContain('archivoRuta');

    const asiento = (await historialDe(pool, empresa.id)).find((a) => a.accion === 'VERSION_SUBIDA');
    expect(asiento).toMatchObject({ entidad_tipo: 'documento', entidad_id: documentoId, detalle: { version: 2, archivo: 'contrato-v2.docx', comentario: 'Corrige la cláusula 4' } });
  });

  it('una versión anterior se ve y se descarga con su propio archivo, y queda registrado cuál', async () => {
    const { autora, empresa, documentoId } = await escenario();
    await subirVersion(autora.token, documentoId, DOCX, 'contrato-v2.docx');

    const v1 = await request(app).get(`/api/v1/documentos/${documentoId}/archivo`).query({ modo: 'descargar', version: 1 }).set(conToken(autora.token));
    const vigente = await request(app).get(`/api/v1/documentos/${documentoId}/archivo`).query({ modo: 'descargar' }).set(conToken(autora.token));

    expect(v1.status).toBe(200);
    expect(decodeURIComponent(v1.body.url)).toContain('contrato-v1.pdf');
    expect(decodeURIComponent(vigente.body.url)).toContain('contrato-v2.docx');
    const descargas = (await historialDe(pool, empresa.id)).filter((a) => a.accion === 'DOCUMENTO_DESCARGADO');
    expect(descargas.map((a) => a.detalle.version)).toEqual([1, 2]);
    // El archivo de la versión 1 sigue ahí: el enlace firmado lo sirve.
    const archivo = await request(app).get(v1.body.url.replace(URL_PUBLICA_DE_PRUEBAS, '')).buffer(true);
    expect(archivo.status).toBe(200);
    expect(Buffer.from(archivo.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    expect((await request(app).get(`/api/v1/documentos/${documentoId}/archivo`).query({ version: 9 }).set(conToken(autora.token))).status).toBe(404);
  });

  it('restaurar copia la versión elegida como una nueva: la historia nunca retrocede', async () => {
    const { autora, empresa, documentoId } = await escenario();
    await subirVersion(autora.token, documentoId, DOCX, 'contrato-v2.docx');

    const respuesta = await restaurar(autora.token, documentoId, 1);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ version: 3, archivo: { nombreOriginal: 'contrato-v1.pdf', tipoMime: 'application/pdf' } });
    const lista = (await versiones(autora.token, documentoId)).body.datos;
    expect(lista.map((v: { numero: number }) => v.numero)).toEqual([3, 2, 1]);
    expect(lista[0]).toMatchObject({ restauradaDe: 1, vigente: true });
    // Es una copia, no la misma ruta: purgar o restaurar después no comparten archivo.
    const { rows } = await pool.query<{ numero: number; archivo_ruta: string }>(
      'SELECT numero, archivo_ruta FROM documento_versiones WHERE documento_id = $1 ORDER BY numero', [documentoId]);
    expect(new Set(rows.map((r) => r.archivo_ruta)).size).toBe(3);
    expect((await historialDe(pool, empresa.id)).find((a) => a.accion === 'VERSION_RESTAURADA')?.detalle)
      .toMatchObject({ version: 3, desde: 1 });

    // La vigente no se restaura sobre sí misma, y una que no existe es un 404.
    expect((await restaurar(autora.token, documentoId, 3)).body.error.codigo).toBe('VERSION_VIGENTE');
    expect((await restaurar(autora.token, documentoId, 7)).status).toBe(404);
    expect((await restaurar(autora.token, documentoId, 'cero')).status).toBe(400);
  });

  it('versiona quien puede editarlo: su autora o un administrador; una compañera, no (y queda registrado)', async () => {
    const { admin, empresa, autora, tokenCompanera, documentoId } = await escenario();

    expect((await subirVersion(tokenCompanera, documentoId)).status).toBe(403);
    expect((await restaurar(tokenCompanera, documentoId, 1)).status).toBe(403);
    expect((await subirVersion(admin, documentoId)).status).toBe(201);
    expect((await ficha(autora.token, documentoId)).body.permisos.versionar).toBe(true);
    expect((await ficha(tokenCompanera, documentoId)).body.permisos.versionar).toBe(false);
    const denegados = (await historialDe(pool, empresa.id)).filter((a) => a.accion === 'ACCESO_DENEGADO');
    expect(denegados.map((a) => a.detalle.operacion)).toEqual(['SUBIR_VERSION', 'RESTAURAR_VERSION']);
  });

  it('la aprobación es de una versión: con una pendiente no se versiona, y con una nueva la ficha dice cuál se aprobó', async () => {
    const { empresa, autora, documentoId } = await escenario();
    const revisora = await crearUsuarioEn(pool, empresa.id, 'administrador');
    const tokenRevisora = await iniciarSesion(app, revisora.email);
    const solicitud = await request(app).post(`/api/v1/documentos/${documentoId}/solicitudes`).set(conToken(autora.token)).send({});
    expect(solicitud.status).toBe(201);

    expect((await subirVersion(autora.token, documentoId)).body.error.codigo).toBe('DOCUMENTO_EN_REVISION');
    expect((await ficha(autora.token, documentoId)).body.permisos.versionar).toBe(false);

    await request(app).post(`/api/v1/solicitudes/${solicitud.body.id}/resolucion`).set(conToken(tokenRevisora)).send({ decision: 'aprobada' });
    expect((await subirVersion(autora.token, documentoId)).status).toBe(201);

    const documento = (await ficha(autora.token, documentoId)).body;
    expect(documento.version).toBe(2);
    expect(documento.ultimaSolicitud).toMatchObject({ estado: 'aprobada', version: 1 });
  });

  describe('una versión y una solicitud de aprobación a la vez se ordenan (D30)', () => {
    /** Dos transacciones abiertas a la vez, como dos pestañas: la segunda espera el bloqueo de la primera. */
    async function enParalelo<A, B>(primera: (db: pg.PoolClient) => Promise<A>, segunda: (db: pg.PoolClient) => Promise<B>) {
      const [uno, dos] = [await pool.connect(), await pool.connect()];
      try {
        await uno.query('BEGIN');
        await dos.query('BEGIN');
        const resultadoUno = await primera(uno);
        const pendienteDos = segunda(dos);
        // La segunda ya está esperando el bloqueo cuando la primera confirma.
        await new Promise((resolver) => setTimeout(resolver, 200));
        await uno.query('COMMIT');
        const resultadoDos = await pendienteDos;
        await dos.query('COMMIT');
        return { resultadoUno, resultadoDos };
      } finally {
        uno.release();
        dos.release();
      }
    }

    it('si la solicitud llega primero, la versión que esperaba la ve pendiente y no se sube', async () => {
      const { empresa, autora, documentoId } = await escenario();

      const { resultadoDos } = await enParalelo(
        (db) => insertarSolicitud(db, { empresaId: empresa.id, documentoId, solicitanteId: autora.id, comentario: null }),
        (db) => bloquearParaVersion(db, empresa.id, documentoId),
      );

      expect(resultadoDos).toMatchObject({ version: 1, pendiente: true });
    });

    it('si la versión llega primero, la solicitud que esperaba pide aprobar esa versión, no la anterior', async () => {
      const { empresa, autora, documentoId } = await escenario();
      const nueva = {
        empresaId: empresa.id, documentoId, numero: 2, archivoNombreOriginal: 'v2.pdf', archivoRuta: `${empresa.id}/carrera-v2.pdf`,
        archivoTipoMime: 'application/pdf', archivoPesoBytes: 10, subidaPor: autora.id, comentario: null, restauradaDe: null,
      };

      const { resultadoDos: solicitudId } = await enParalelo(
        async (db) => {
          await bloquearParaVersion(db, empresa.id, documentoId);
          await insertarVersion(db, nueva);
          await hacerVigente(db, nueva);
        },
        (db) => insertarSolicitud(db, { empresaId: empresa.id, documentoId, solicitanteId: autora.id, comentario: null }),
      );

      const { rows: [solicitud] } = await pool.query<{ version: number }>('SELECT version FROM solicitudes WHERE id = $1', [solicitudId]);
      expect(solicitud?.version).toBe(2);
    });
  });

  it('las versiones salen en la actividad del documento', async () => {
    const { autora, documentoId } = await escenario();
    await subirVersion(autora.token, documentoId);
    await restaurar(autora.token, documentoId, 1);

    const actividad = await request(app).get(`/api/v1/documentos/${documentoId}/actividad`).set(conToken(autora.token));

    expect(actividad.body.datos.map((a: { accion: string }) => a.accion)).toEqual(['VERSION_RESTAURADA', 'VERSION_SUBIDA', 'DOCUMENTO_SUBIDO']);
  });

  it('el espacio cuenta todas las versiones, y purgar borra el archivo de cada una', async () => {
    const { admin, autora, documentoId } = await escenario();
    await subirVersion(autora.token, documentoId, DOCX, 'v2.docx');
    const espacio = async () => (await request(app).get('/api/v1/tablero').set(conToken(admin))).body.resumen.almacenamientoBytes;
    expect(await espacio()).toBe(PDF.length + DOCX.length);

    const { rows } = await pool.query<{ archivo_ruta: string }>('SELECT archivo_ruta FROM documento_versiones WHERE documento_id = $1', [documentoId]);
    await request(app).delete(`/api/v1/documentos/${documentoId}`).set(conToken(autora.token));
    expect((await request(app).delete(`/api/v1/documentos/papelera/${documentoId}`).set(conToken(admin))).status).toBe(204);

    expect(await espacio()).toBe(0);
    // Ningún archivo sobrevive a la purga: un enlace firmado a cualquiera de ellos ya no sirve nada.
    for (const { archivo_ruta: ruta } of rows) {
      const url = await almacenamientoDePruebas().firmarEnlace(ruta, { segundos: 60, tipoMime: 'application/pdf' });
      expect((await request(app).get(url.replace(URL_PUBLICA_DE_PRUEBAS, ''))).status).toBe(404);
    }
  });

  it('una categoría restringida oculta también sus versiones, y otra empresa no llega a ninguna', async () => {
    const { admin, empresa, autora, tokenCompanera, documentoId } = await escenario();
    const categoria = await request(app).post('/api/v1/categorias').set(conToken(admin))
      .send({ nombre: 'Confidencial', restringida: true, usuariosAutorizados: [autora.id] });
    await request(app).patch(`/api/v1/documentos/${documentoId}`).set(conToken(admin)).send({ categoriaId: categoria.body.id });

    expect((await versiones(autora.token, documentoId)).status).toBe(200);
    expect((await versiones(tokenCompanera, documentoId)).status).toBe(404);
    expect((await request(app).get(`/api/v1/documentos/${documentoId}/archivo`).query({ version: 1 }).set(conToken(tokenCompanera))).status).toBe(404);

    // Por debajo de la API, la base tampoco las muestra a quien no tiene acceso a la categoría.
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('role', 'app_empresa', true), set_config('app.empresa_id', $1, true), set_config('app.rol', 'usuario', true)", [empresa.id]);
      expect((await cliente.query('SELECT count(*)::int AS n FROM documento_versiones WHERE documento_id = $1', [documentoId])).rows[0].n).toBe(0);
      await cliente.query('ROLLBACK');
    } finally {
      cliente.release();
    }

    const { token: ajeno } = await registrarEmpresa(app);
    expect((await versiones(ajeno, documentoId)).status).toBe(404);
    expect((await subirVersion(ajeno, documentoId)).status).toBe(404);
    expect((await restaurar(ajeno, documentoId, 1)).status).toBe(404);
  });
});
