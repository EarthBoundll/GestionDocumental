import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pdfDeTexto } from '../../scripts/pdf-de-texto.js';
import { guardarSiSiguePendiente, pendientesDeLeer } from '../../src/modulos/documentos/contenido.js';
import { leerPendientes } from '../../src/tareas/leer-contenido.js';
import { almacenamientoDePruebas, crearAppDePruebas, crearUsuarioEn, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { PNG } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/**
 * La búsqueda en el contenido (D45): lo que dice el archivo se lee al subirlo, se busca por la raíz de cada
 * palabra con la misma RLS y muestra dónde coincidió; las palabras clave salen en la ficha.
 */
describe('Contenido de los documentos (D45)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  const almacenamiento = almacenamientoDePruebas();
  const con = (token: string) => ({ Authorization: `Bearer ${token}` });

  const pdf = (...lineas: string[]) => pdfDeTexto(lineas.map((texto) => ({ texto })));
  const FACTURA = pdf('FACTURA ELECTRÓNICA F001-00000045', 'RUC 20600000014', 'Cliente: Boutique Lucero (ficticia)',
    'Fecha de emisión: 05/03/2026', '12 Casaca polar con capucha S/ 744.00', 'Importe total: S/ 877.92');

  async function subir(token: string, campos: Record<string, string>, archivo: Buffer, nombreArchivo: string) {
    const peticion = request(app).post('/api/v1/documentos').set(con(token));
    for (const [campo, valor] of Object.entries(campos)) peticion.field(campo, valor);
    const respuesta = await peticion.attach('archivo', archivo, nombreArchivo);
    expect(respuesta.status, JSON.stringify(respuesta.body)).toBe(201);
    return respuesta.body as { id: string; contenido: { estado: string; palabrasClave: { datos: { tipo: string; valor: string }[]; palabras: string[] } | null } };
  }
  const buscar = (token: string, q: string) => request(app).get('/api/v1/documentos').query({ q }).set(con(token));
  const categorias = async (token: string) => (await request(app).get('/api/v1/categorias').set(con(token))).body.datos as { id: string; nombre: string }[];

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool, {}, almacenamiento);
  });
  afterAll(() => base.cerrar());

  it('lee el PDF al subirlo: se encuentra por lo que dice, con el fragmento, y la ficha trae sus palabras clave', async () => {
    const { token } = await registrarEmpresa(app);
    const facturas = (await categorias(token)).find((c) => c.nombre === 'Facturas y boletas')!.id;
    await subir(token, { nombre: 'Compra de tela', categoriaId: facturas, fechaDocumento: '2026-03-01' }, pdf('FACTURA ELECTRÓNICA F001-00000044',
      'RUC 20600000022', 'Cliente: Tienda Aurora (ficticia)', 'Fecha de emisión: 01/03/2026', '5 Pantalón drill S/ 300.00'), 'compra.pdf');
    const subido = await subir(token, { nombre: 'Escaneo 0045', categoriaId: facturas, fechaDocumento: '2026-03-05' }, FACTURA, 'scan-0045.pdf');

    expect(subido.contenido.estado).toBe('leido');
    expect(subido.contenido.palabrasClave!.datos).toEqual(expect.arrayContaining([
      { tipo: 'ruc', valor: '20600000014' }, { tipo: 'comprobante', valor: 'F001-00000045' },
      { tipo: 'monto', valor: 'S/ 877.92' }, { tipo: 'fecha', valor: '05/03/2026' },
    ]));
    // «factura» y «emisión» ya estaban en la otra factura de la empresa: pesan menos que lo propio de esta.
    const { palabras } = subido.contenido.palabrasClave!;
    expect(palabras).toEqual(expect.arrayContaining(['casaca', 'polar', 'capucha', 'lucero']));
    expect(palabras.indexOf('factura')).toBeGreaterThan(palabras.indexOf('capucha'));

    // «casacas lucero»: el nombre no lo dice; el archivo sí, en plural distinto y sin tildes.
    const respuesta = await buscar(token, 'casacas lucero');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toHaveLength(1);
    expect(respuesta.body.datos[0]).toMatchObject({ id: subido.id, coincidencia: 'contenido' });
    const fragmento = respuesta.body.datos[0].fragmento as { texto: string; resaltado: boolean }[];
    // El fragmento va alrededor de la primera coincidencia, con el texto tal como está en el archivo.
    expect(fragmento.map((trozo) => trozo.texto).join('')).toContain('Cliente: Boutique Lucero (ficticia)');
    expect(fragmento.filter((trozo) => trozo.resaltado).map((trozo) => trozo.texto)).toEqual(['Lucero']);
    // Un RUC también, como parte de una palabra no: se busca por el comienzo.
    expect((await buscar(token, '20600000014')).body.datos.map((d: { id: string }) => d.id)).toEqual([subido.id]);
    // Lo que coincide en el nombre sigue primero, y sin fragmento.
    expect((await buscar(token, 'escaneo')).body.datos[0]).not.toHaveProperty('fragmento');
  });

  it('el contenido no cruza empresas ni categorías restringidas: la misma RLS decide', async () => {
    const a = await registrarEmpresa(app);
    const b = await registrarEmpresa(app);
    const usuaria = await crearUsuarioEn(pool, a.empresa.id);
    const tokenUsuaria = await iniciarSesion(app, usuaria.email);
    const creada = await request(app).post('/api/v1/categorias').set(con(a.token)).send({ nombre: 'Planillas', restringida: true, usuariosAutorizados: [] });
    expect(creada.status).toBe(201);
    await subir(a.token, { nombre: 'Planilla de octubre', categoriaId: creada.body.id, fechaDocumento: '2026-10-01' },
      pdf('Sueldo de la costurera Rosalinda (ficticia): S/ 1,350.00'), 'planilla.pdf');

    expect((await buscar(a.token, 'rosalinda')).body.datos).toHaveLength(1);
    expect((await buscar(tokenUsuaria, 'rosalinda')).body.datos).toHaveLength(0);
    expect((await buscar(b.token, 'rosalinda')).body.datos).toHaveLength(0);
  });

  it('una versión nueva cambia el contenido; restaurar la anterior lo devuelve, leyendo la copia del archivo', async () => {
    const { token } = await registrarEmpresa(app);
    const otros = (await categorias(token)).find((c) => c.nombre === 'Otros')!.id;
    const { id } = await subir(token, { nombre: 'Cotización', categoriaId: otros, fechaDocumento: '2026-04-01' }, pdf('Tela jersey azul marino'), 'v1.pdf');

    const version = await request(app).post(`/api/v1/documentos/${id}/versiones`).set(con(token)).attach('archivo', pdf('Hilo poliéster en conos'), 'v2.pdf');
    expect(version.status).toBe(201);
    expect((await buscar(token, 'jersey')).body.datos).toHaveLength(0);
    expect((await buscar(token, 'poliester')).body.datos).toHaveLength(1);

    const restaurada = await request(app).post(`/api/v1/documentos/${id}/versiones/1/restauracion`).set(con(token));
    expect(restaurada.status).toBe(201);
    expect(restaurada.body.contenido.estado).toBe('leido');
    expect((await buscar(token, 'jersey')).body.datos).toHaveLength(1);
    expect((await buscar(token, 'poliester')).body.datos).toHaveLength(0);
  });

  it('una foto se sube igual, sin contenido; purgar un documento borra también lo que se leyó de él', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const otros = (await categorias(token)).find((c) => c.nombre === 'Otros')!.id;
    const foto = await subir(token, { nombre: 'Foto del recibo', categoriaId: otros, fechaDocumento: '2026-05-05' }, PNG, 'recibo.png');
    expect(foto.contenido).toEqual({ estado: 'no_admitido', palabrasClave: null });

    const { id } = await subir(token, { nombre: 'Contrato', categoriaId: otros, fechaDocumento: '2026-05-06' }, pdf('Arrendamiento del local de Gamarra'), 'contrato.pdf');
    expect((await request(app).delete(`/api/v1/documentos/${id}`).set(con(token))).status).toBe(204);
    expect((await request(app).delete(`/api/v1/documentos/papelera/${id}`).set(con(token))).status).toBe(204);
    const { rows: [fila] } = await pool.query('SELECT contenido, palabras_clave, purgado_en FROM documentos WHERE empresa_id = $1 AND id = $2', [empresa.id, id]);
    expect(fila).toMatchObject({ contenido: null, palabras_clave: null });
    expect(fila.purgado_en).not.toBeNull();
  });

  it('lo subido antes de la migración queda pendiente, y la tarea de lectura lo lee en segundo plano', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const otros = (await categorias(token)).find((c) => c.nombre === 'Otros')!.id;
    const { id } = await subir(token, { nombre: 'Guía antigua', categoriaId: otros, fechaDocumento: '2025-01-10' }, pdf('Traslado de botones de nácar'), 'guia.pdf');
    // Como si se hubiera subido antes de la 015: sin contenido y pendiente.
    await pool.query("UPDATE documentos SET contenido = NULL, palabras_clave = NULL, contenido_estado = 'pendiente' WHERE id = $1", [id]);
    expect((await buscar(token, 'nacar')).body.datos).toHaveLength(0);

    expect(await leerPendientes(pool, almacenamiento)).toBeGreaterThanOrEqual(1);

    const { rows: [fila] } = await pool.query('SELECT contenido_estado FROM documentos WHERE empresa_id = $1 AND id = $2', [empresa.id, id]);
    expect(fila.contenido_estado).toBe('leido');
    expect((await buscar(token, 'nacar')).body.datos).toHaveLength(1);
  });

  it('lo leído en segundo plano no pisa una versión subida mientras tanto', async () => {
    const { token, empresa } = await registrarEmpresa(app);
    const otros = (await categorias(token)).find((c) => c.nombre === 'Otros')!.id;
    const { id } = await subir(token, { nombre: 'Pedido', categoriaId: otros, fechaDocumento: '2025-02-01' }, pdf('Tela jersey azul marino'), 'v1.pdf');
    await pool.query("UPDATE documentos SET contenido = NULL, palabras_clave = NULL, contenido_estado = 'pendiente' WHERE id = $1", [id]);
    // La tarea toma el pendiente y, mientras lo lee, alguien sube una versión nueva.
    const [pendiente] = await pendientesDeLeer(pool, empresa.id, 20);
    expect(pendiente!.id).toBe(id);
    expect((await request(app).post(`/api/v1/documentos/${id}/versiones`).set(con(token)).attach('archivo', pdf('Hilo poliéster en conos'), 'v2.pdf')).status).toBe(201);

    const guardado = await guardarSiSiguePendiente(pool, empresa.id, pendiente!, { estado: 'leido', texto: 'Tela jersey azul marino', palabrasClave: null });
    expect(guardado).toBe(false);
    expect((await buscar(token, 'poliester')).body.datos).toHaveLength(1);
    expect((await buscar(token, 'jersey')).body.datos).toHaveLength(0);
  });
});
