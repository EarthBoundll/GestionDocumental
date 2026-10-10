import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { terminosDeBusqueda } from '../../src/modulos/documentos/busqueda.js';
import { crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { DOCX, PDF, PNG } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/**
 * El buscador documental (RF10, D42): cada caso de la lista del pedido tiene aquí su prueba, salvo el
 * rendimiento con 50.000 documentos (tests/carga) y el uso en el celular (e2e/documentos.spec.ts).
 */
describe('Búsqueda documental (D42)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;

  /** Una empresa con documentos variados: nombres, archivos, descripciones, tipos, estados y una categoría restringida. */
  const e = {} as {
    empresaId: string; admin: string; usuario: string; usuarioId: string; otra: string; otraId: string;
    categoria: (nombre: string) => string; ids: Record<string, string>;
  };

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool);
    const sesion = await registrarEmpresa(app);
    e.empresaId = sesion.empresa.id;
    e.admin = sesion.token;
    const usuaria = await crearUsuarioEn(pool, e.empresaId);
    e.usuarioId = usuaria.id;
    e.usuario = await iniciarSesion(app, usuaria.email);
    const otra = await crearUsuarioEn(pool, e.empresaId);
    e.otraId = otra.id;
    e.otra = await iniciarSesion(app, otra.email);
    // «Legal» la ven todos; «Planillas» solo los administradores y la usuaria autorizada (D22).
    await crear('/api/v1/categorias', e.admin, { nombre: 'Legal' });
    await crear('/api/v1/categorias', e.admin, { nombre: 'Planillas', restringida: true, usuariosAutorizados: [e.otraId] });
    const categorias = (await request(app).get('/api/v1/categorias').set(con(e.admin))).body.datos as { id: string; nombre: string }[];
    e.categoria = (nombre) => categorias.find((c) => c.nombre === nombre)!.id;

    e.ids = {};
    const subir = async (clave: string, token: string, campos: Record<string, string>, archivo = PDF, nombreArchivo = 'documento.pdf') => {
      const peticion = request(app).post('/api/v1/documentos').set(con(token));
      for (const [campo, valor] of Object.entries(campos)) peticion.field(campo, valor);
      const respuesta = await peticion.attach('archivo', archivo, nombreArchivo);
      expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
      e.ids[clave] = respuesta.body.id;
    };
    const otros = e.categoria('Otros');
    await subir('proveedor', e.usuario, { nombre: 'Factura de proveedor - octubre', categoriaId: e.categoria('Facturas y boletas'), fechaDocumento: '2026-10-02' });
    await subir('f0245', e.usuario, { nombre: 'Factura F001-0245', categoriaId: e.categoria('Facturas y boletas'), fechaDocumento: '2026-09-15' }, PDF, 'F001-0245.pdf');
    await subir('alquiler', e.usuario, { nombre: 'Contrato de alquiler del local', categoriaId: e.categoria('Legal'), fechaDocumento: '2026-08-20' });
    await subir('servicios', e.usuario, { nombre: 'Contrato de servicios de limpieza', categoriaId: e.categoria('Legal'), fechaDocumento: '2026-03-01' }, DOCX, 'servicios.docx');
    await subir('cotizacion', e.otra, { nombre: 'Cotización de útiles', categoriaId: e.categoria('Cotizaciones'), fechaDocumento: '2026-07-07' });
    await subir('acta', e.otra, { nombre: 'Acta de reunión', categoriaId: otros, fechaDocumento: '2026-06-01', descripcion: 'Se acordó renovar el contrato del local' });
    await subir('foto', e.otra, { nombre: 'Foto del almacén', categoriaId: otros, fechaDocumento: '2026-05-05' }, PNG, 'almacen.png');
    await subir('contrato', e.usuario, { nombre: 'Contrato', categoriaId: otros, fechaDocumento: '2026-04-04' });
    await subir('planilla', e.admin, { nombre: 'Planilla de sueldos de octubre', categoriaId: e.categoria('Planillas'), fechaDocumento: '2026-10-01' });
    await subir('eliminado', e.usuario, { nombre: 'Contrato anulado', categoriaId: e.categoria('Legal'), fechaDocumento: '2026-09-09' });
    expect((await request(app).delete(`/api/v1/documentos/${e.ids.eliminado}`).set(con(e.usuario))).status).toBe(204);

    // Estados de aprobación: «alquiler» aprobado, «servicios» rechazado, «proveedor» pendiente.
    const pedir = async (clave: string) => (await crear(`/api/v1/documentos/${e.ids[clave]}/solicitudes`, e.usuario, {})).id as string;
    await crear(`/api/v1/solicitudes/${await pedir('alquiler')}/resolucion`, e.admin, { decision: 'aprobada' });
    await crear(`/api/v1/solicitudes/${await pedir('servicios')}/resolucion`, e.admin, { decision: 'rechazada', comentario: 'Falta la firma' });
    await pedir('proveedor');
  });
  afterAll(() => base.cerrar());

  const con = (token: string) => ({ Authorization: `Bearer ${token}` });
  async function crear(ruta: string, token: string, cuerpo: object) {
    const respuesta = await request(app).post(ruta).set(con(token)).send(cuerpo);
    expect(respuesta.status, `${ruta}: ${JSON.stringify(respuesta.body)}`).toBeLessThan(300);
    return respuesta.body;
  }
  const buscar = (token: string, consulta: Record<string, string>) =>
    request(app).get('/api/v1/documentos').query(consulta).set(con(token));
  const nombres = (respuesta: request.Response) => respuesta.body.datos.map((d: { nombre: string }) => d.nombre);
  const sugerir = (token: string, q: string) => request(app).get('/api/v1/documentos/sugerencias').query({ q }).set(con(token));

  describe('lo que encuentra', () => {
    it('1 · la coincidencia exacta con el nombre sale primero, y lo dice', async () => {
      const respuesta = await buscar(e.usuario, { q: 'contrato' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.datos[0]).toMatchObject({ nombre: 'Contrato', coincidencia: 'nombre_exacto' });
    });

    it('2 · por parte de una palabra y por su raíz: «contra», «0245», «facturas proveedores»', async () => {
      expect(nombres(await buscar(e.usuario, { q: 'contra' }))).toEqual(expect.arrayContaining(['Contrato de alquiler del local', 'Contrato']));
      expect(nombres(await buscar(e.usuario, { q: '0245' }))).toEqual(['Factura F001-0245']);
      // El ejemplo del pedido: otro número y sin «de», en cualquier orden.
      expect(nombres(await buscar(e.usuario, { q: 'facturas proveedores' }))).toEqual(['Factura de proveedor - octubre']);
      expect(nombres(await buscar(e.usuario, { q: 'proveedores facturas' }))).toEqual(['Factura de proveedor - octubre']);
    });

    it('3 y 4 · con o sin tildes, en mayúsculas o minúsculas y con espacios de más, encuentra lo mismo', async () => {
      const variantes = ['cotizacion', 'Cotización', 'COTIZACIÓN', '   cotizacion    de   utiles  ', 'CoTiZaCiOn ÚTILES'];
      for (const q of variantes) expect(nombres(await buscar(e.usuario, { q })), q).toEqual(['Cotización de útiles']);
    });

    it('en la descripción, en el nombre del archivo y en la categoría, con su nivel de relevancia', async () => {
      expect((await buscar(e.usuario, { q: 'renovar' })).body.datos).toEqual([
        expect.objectContaining({ nombre: 'Acta de reunión', coincidencia: 'descripcion' }),
      ]);
      expect((await buscar(e.usuario, { q: 'almacen png' })).body.datos[0]).toMatchObject({ nombre: 'Foto del almacén' });
      expect((await buscar(e.usuario, { q: 'legal' })).body.datos.map((d: { coincidencia: string }) => d.coincidencia))
        .toEqual(['categoria', 'categoria']);
    });

    it('5 · sin resultados lo dice, lo registra con 0 resultados y no inventa parecidos', async () => {
      const respuesta = await buscar(e.usuario, { q: 'zzzqqq xxyyww' });

      expect(respuesta.body).toMatchObject({ datos: [], paginacion: { total: 0 }, aproximada: false });
      expect((await historialDe(pool, e.empresaId)).at(-1)).toMatchObject({
        accion: 'BUSQUEDA_REALIZADA', detalle: { filtros: { q: 'zzzqqq xxyyww' }, resultados: 0 },
      });
    });

    it('un error de escritura pequeño encuentra lo parecido, marcado como aproximado y sin mezclarlo', async () => {
      const respuesta = await buscar(e.usuario, { q: 'factrua provedor' });

      expect(respuesta.body.aproximada).toBe(true);
      expect(respuesta.body.datos[0]).toMatchObject({ nombre: 'Factura de proveedor - octubre', coincidencia: 'parecido' });
      expect(respuesta.body.datos.every((d: { coincidencia: string }) => d.coincidencia === 'parecido')).toBe(true);
      expect((await historialDe(pool, e.empresaId)).at(-1)?.detalle).toMatchObject({ aproximada: true });
      // Con palabras cortas no hay segunda pasada: «xq» se parecería a cualquier cosa.
      expect((await buscar(e.usuario, { q: 'xq' })).body).toMatchObject({ datos: [], aproximada: false });
      // Ni con números: «0246» se parece a «0245», pero es otro documento (lo encontró la prueba de carga).
      expect((await buscar(e.usuario, { q: '0246' })).body).toMatchObject({ datos: [], aproximada: false });
      expect((await buscar(e.usuario, { q: 'factrua 0246' })).body).toMatchObject({ datos: [], aproximada: false });
    });
  });

  describe('filtros y orden', () => {
    it('6 · combina texto, categoría, estado, tipo, autor y fechas, como el ejemplo del pedido', async () => {
      // Texto «contrato», categoría «Legal», estado «aprobado», fecha del último trimestre.
      const ejemplo = { q: 'contrato', categoriaId: e.categoria('Legal'), estado: 'aprobada', desde: '2026-07-01', hasta: '2026-09-30' };
      expect(nombres(await buscar(e.usuario, ejemplo))).toEqual(['Contrato de alquiler del local']);

      expect(nombres(await buscar(e.usuario, { estado: 'rechazada' }))).toEqual(['Contrato de servicios de limpieza']);
      expect(nombres(await buscar(e.usuario, { estado: 'pendiente' }))).toEqual(['Factura de proveedor - octubre']);
      // El acta menciona un contrato en su descripción, y tampoco tiene solicitud.
      expect(nombres(await buscar(e.usuario, { estado: 'sin_solicitud', q: 'contrato' }))).toEqual(['Contrato', 'Acta de reunión']);
      expect(nombres(await buscar(e.usuario, { tipo: 'word' }))).toEqual(['Contrato de servicios de limpieza']);
      expect(nombres(await buscar(e.usuario, { tipo: 'imagen' }))).toEqual(['Foto del almacén']);
      expect(nombres(await buscar(e.usuario, { subidoPor: e.otraId, orden: 'nombre' })))
        .toEqual(['Acta de reunión', 'Cotización de útiles', 'Foto del almacén']);
      expect((await historialDe(pool, e.empresaId)).at(-1)?.detalle).toMatchObject({ filtros: { subidoPor: e.otraId } });
    });

    it('las fechas pueden ser las del documento o las de su subida, en días de Lima', async () => {
      await pool.query("UPDATE documentos SET creado_en = '2026-01-15 04:30:00+00' WHERE id = $1", [e.ids.foto]);
      try {
        // 04:30 UTC del 15 es el 14 en Lima.
        const subidos = await buscar(e.usuario, { fechaDe: 'subida', desde: '2026-01-14', hasta: '2026-01-14' });
        expect(nombres(subidos)).toEqual(['Foto del almacén']);
        expect(nombres(await buscar(e.usuario, { fechaDe: 'subida', desde: '2026-01-15', hasta: '2026-01-15' }))).toEqual([]);
        expect(nombres(await buscar(e.usuario, { desde: '2026-05-05', hasta: '2026-05-05' }))).toEqual(['Foto del almacén']);
      } finally {
        await pool.query('UPDATE documentos SET creado_en = now() WHERE id = $1', [e.ids.foto]);
      }
    });

    it('los filtros se validan en el servidor', async () => {
      const respuesta = await buscar(e.usuario, { tipo: 'exe', estado: 'borrador', subidoPor: 'yo', fechaDe: 'ayer', orden: 'azar' });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.detalles.map((d: { campo: string }) => d.campo).sort())
        .toEqual(['estado', 'fechaDe', 'orden', 'subidoPor', 'tipo']);
    });

    it('7 · pagina los resultados ordenados por relevancia sin repetir ni perder ninguno', async () => {
      const todos = nombres(await buscar(e.usuario, { q: 'contrato', porPagina: '100' }));
      const paginas = [];
      for (let pagina = 1; pagina <= 3; pagina++) {
        const respuesta = await buscar(e.usuario, { q: 'contrato', porPagina: '2', pagina: String(pagina) });
        expect(respuesta.body.paginacion).toMatchObject({ pagina, porPagina: 2, total: todos.length });
        paginas.push(...nombres(respuesta));
      }

      expect(paginas).toEqual(todos);
    });

    it('8 · ordena de lo exacto a lo lejano: nombre exacto, comienzo, nombre, descripción y categoría', async () => {
      const respuesta = await buscar(e.usuario, { q: 'contrato' });

      expect(respuesta.body.datos.map((d: { nombre: string; coincidencia: string }) => [d.nombre, d.coincidencia])).toEqual([
        ['Contrato', 'nombre_exacto'],
        // Las dos empiezan por «contrato»: desempata la relevancia del texto y después lo reciente.
        expect.arrayContaining([expect.stringMatching(/^Contrato de/), 'nombre_inicio']),
        expect.arrayContaining([expect.stringMatching(/^Contrato de/), 'nombre_inicio']),
        ['Acta de reunión', 'descripcion'],
      ]);
      // Con otro orden elegido, el mismo texto se ordena por fecha del documento.
      expect(nombres(await buscar(e.usuario, { q: 'contrato', orden: 'fecha' })))
        .toEqual(['Contrato de alquiler del local', 'Acta de reunión', 'Contrato', 'Contrato de servicios de limpieza']);
    });
  });

  describe('lo que no debe aparecer', () => {
    it('9 · lo que está en la papelera no sale en la búsqueda ni en las sugerencias', async () => {
      expect(nombres(await buscar(e.usuario, { q: 'anulado' }))).toEqual([]);
      expect((await sugerir(e.usuario, 'anulado')).body.datos).toEqual([]);
    });

    it('10 · una categoría restringida no se descubre buscando ni con sugerencias, salvo para quien tiene acceso', async () => {
      expect(nombres(await buscar(e.usuario, { q: 'planilla sueldos' }))).toEqual([]);
      expect((await sugerir(e.usuario, 'planil')).body.datos).toEqual([]);
      // Ni siquiera buscando el nombre de la categoría ni por parecido.
      expect(nombres(await buscar(e.usuario, { q: 'planillas' }))).toEqual([]);
      expect(nombres(await buscar(e.usuario, { q: 'plantilla sueldso' }))).toEqual([]);
      expect(nombres(await buscar(e.otra, { q: 'planilla sueldos' }))).toEqual(['Planilla de sueldos de octubre']);
      expect(nombres(await buscar(e.admin, { q: 'planilla sueldos' }))).toEqual(['Planilla de sueldos de octubre']);
      // Elegir como «sugerencia» un documento que no ve responde como si no existiera.
      const elegir = await request(app).post('/api/v1/documentos/busquedas').set(con(e.usuario)).send({ q: 'planilla', documentoId: e.ids.planilla });
      expect(elegir.status).toBe(404);
    });

    it('11 · otra empresa no encuentra nada de esta, aunque mande el empresaId', async () => {
      const ajena = await registrarEmpresa(app);

      for (const q of ['contrato', 'factura', 'cotizacion', 'factrua']) {
        expect((await buscar(ajena.token, { q, empresaId: e.empresaId })).body.paginacion.total, q).toBe(0);
        expect((await sugerir(ajena.token, q)).body.datos, q).toEqual([]);
      }
      const elegir = await request(app).post('/api/v1/documentos/busquedas').set(con(ajena.token))
        .send({ q: 'contrato', documentoId: e.ids.contrato, empresaId: e.empresaId });
      expect(elegir.status).toBe(404);
    });

    it('12 · los caracteres especiales son texto: ni comodines, ni operadores, ni inyección', async () => {
      const especiales = ['%', '_', "'", '\\', '&|!:*()', '--', "contrato' OR '1'='1", 'contrato%', 'contr_to', '<script>', '); DROP TABLE documentos; --'];
      for (const q of especiales) {
        const respuesta = await buscar(e.usuario, { q });
        expect(respuesta.status, q).toBe(200);
        expect((await sugerir(e.usuario, q.length >= 2 ? q : q + q)).status, q).toBe(200);
      }
      // Solo signos: no hay palabra que buscar, y no se devuelve todo.
      expect((await buscar(e.usuario, { q: '%' })).body.paginacion.total).toBe(0);
      expect((await buscar(e.usuario, { q: '_' })).body.paginacion.total).toBe(0);
      // «contrato' OR '1'='1» busca esas palabras, no las ejecuta.
      expect(nombres(await buscar(e.usuario, { q: "contrato' OR '1'='1" }))).toEqual([]);
      expect(terminosDeBusqueda("contrato' OR '1'='1").palabras).toEqual(['contrato', 'or', '1']);
      const { rows } = await pool.query('SELECT count(*)::int AS documentos FROM documentos');
      expect(rows[0].documentos).toBeGreaterThan(0);
    });
  });

  describe('sugerencias mientras se escribe (D36, D42)', () => {
    it('sugieren lo más relevante desde dos letras, sin registrarse', async () => {
      const antes = (await historialDe(pool, e.empresaId)).length;

      const respuesta = await sugerir(e.usuario, 'contr');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.datos.length).toBeLessThanOrEqual(5);
      expect(respuesta.body.datos[0]).toMatchObject({ nombre: 'Contrato', categoria: 'Otros', coincidencia: 'nombre_inicio' });
      expect((await historialDe(pool, e.empresaId)).length).toBe(antes);
      expect((await sugerir(e.usuario, 'c')).status).toBe(400);
    });

    it('elegir una sugerencia sí queda en el historial, como una búsqueda que encontró lo que buscaba', async () => {
      const respuesta = await request(app).post('/api/v1/documentos/busquedas').set(con(e.usuario))
        .send({ q: 'contr', documentoId: e.ids.contrato });

      expect(respuesta.status).toBe(204);
      expect((await historialDe(pool, e.empresaId)).at(-1)).toMatchObject({
        accion: 'BUSQUEDA_REALIZADA', usuario_id: e.usuarioId,
        detalle: { filtros: { q: 'contr' }, resultados: 1, origen: 'sugerencia', documento: 'Contrato', documentoId: e.ids.contrato },
      });
    });

    it('una versión nueva con otro archivo se encuentra por el nombre del archivo nuevo', async () => {
      const subida = await request(app).post(`/api/v1/documentos/${e.ids.foto}/versiones`).set(con(e.otra))
        .attach('archivo', PNG, 'inventario-noviembre.png');
      expect(subida.status).toBe(201);

      expect(nombres(await buscar(e.usuario, { q: 'inventario noviembre' }))).toEqual(['Foto del almacén']);
    });
  });
});
