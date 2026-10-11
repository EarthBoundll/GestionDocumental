import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLAVE, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa } from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/**
 * Un historial que se lee (D46): la rutina se sigue registrando —de ella salen los indicadores 2 a 5 y el
 * bloqueo por contraseñas— pero no ocupa la vista principal, y una misma búsqueda no se cuenta dos veces.
 */
describe('Historial ordenado (D46)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  const con = (token: string) => ({ Authorization: `Bearer ${token}` });
  const consultar = (token: string, query: Record<string, string> = {}) => request(app).get('/api/v1/historial').query(query).set(con(token));
  const acciones = (cuerpo: { datos: { accion: string }[] }) => cuerpo.datos.map((asiento) => asiento.accion);
  const buscar = (token: string, query: Record<string, string>) => request(app).get('/api/v1/documentos').query(query).set(con(token));
  const busquedasDe = async (empresaId: string, usuarioId: string) =>
    (await historialDe(pool, empresaId)).filter((a) => a.accion === 'BUSQUEDA_REALIZADA' && a.usuario_id === usuarioId);

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool);
  });
  afterAll(() => base.cerrar());

  it('«lo importante» deja fuera inicios de sesión, búsquedas y vistas, y conserva lo de seguridad', async () => {
    const { token, usuario, empresa } = await registrarEmpresa(app);
    const persona = await crearUsuarioEn(pool, empresa.id);
    await iniciarSesion(app, persona.email);
    await request(app).post('/api/v1/auth/login').send({ email: persona.email, clave: 'una-clave-equivocada' });
    await buscar(token, { q: 'contrato' });
    await request(app).patch(`/api/v1/usuarios/${persona.id}/estado`).set(con(token)).send({ activo: false });

    const importante = acciones((await consultar(token, { grupo: 'importante' })).body);
    expect(importante).toEqual(expect.arrayContaining(['USUARIO_DESACTIVADO', 'SESION_FALLIDA', 'USUARIO_CREADO', 'EMPRESA_CREADA']));
    expect(importante).not.toContain('SESION_INICIADA');
    expect(importante).not.toContain('BUSQUEDA_REALIZADA');
    // La rutina sigue registrada y se consulta aparte; sin grupo, todo, como antes.
    const rutina = acciones((await consultar(token, { grupo: 'rutina' })).body);
    expect(new Set(rutina)).toEqual(new Set(['SESION_INICIADA', 'BUSQUEDA_REALIZADA']));
    expect(acciones((await consultar(token)).body)).toHaveLength(importante.length + rutina.length);
    // El inicio de sesión que alimenta el indicador 5 sigue ahí, con su autor.
    expect((await historialDe(pool, empresa.id)).filter((a) => a.accion === 'SESION_INICIADA').map((a) => a.usuario_id))
      .toEqual(expect.arrayContaining([usuario.id, persona.id]));
  });

  it('el Excel respeta el grupo y lo dice en sus filtros', async () => {
    const { token } = await registrarEmpresa(app);
    await buscar(token, { q: 'factura' });

    const exportado = await request(app).get('/api/v1/historial/exportar').query({ grupo: 'importante' }).set(con(token));

    expect(exportado.status).toBe(200);
    expect(exportado.text).not.toContain('BUSQUEDA_REALIZADA');
    expect(exportado.text).not.toContain('SESION_INICIADA');
  });

  it('una misma búsqueda cuenta una vez: pasar de página, cambiar el orden o volver a la lista no suma', async () => {
    const { token, usuario, empresa } = await registrarEmpresa(app);

    await buscar(token, { q: 'contrato' });
    await buscar(token, { q: 'contrato', pagina: '2' });
    await buscar(token, { q: 'contrato', orden: 'nombre' });
    await buscar(token, { q: 'contrato' });
    expect(await busquedasDe(empresa.id, usuario.id)).toHaveLength(1);

    // Otra búsqueda sí es otra, y elegir una sugerencia se registra aparte, aunque diga lo mismo.
    await buscar(token, { q: 'contrato', tipo: 'pdf' });
    await buscar(token, { q: 'factura' });
    const categoria = (await request(app).get('/api/v1/categorias').set(con(token))).body.datos[0].id as string;
    const documento = await request(app).post('/api/v1/documentos').set(con(token)).field('nombre', 'Contrato de alquiler')
      .field('categoriaId', categoria).field('fechaDocumento', '2026-09-15').attach('archivo', PDF, 'contrato.pdf');
    expect((await request(app).post('/api/v1/documentos/busquedas').set(con(token))
      .send({ q: 'contrato', documentoId: documento.body.id })).status).toBe(204);
    expect((await busquedasDe(empresa.id, usuario.id)).map((a) => a.detalle)).toEqual([
      expect.objectContaining({ filtros: { q: 'contrato' } }),
      expect.objectContaining({ filtros: { q: 'contrato', tipo: 'pdf' } }),
      expect.objectContaining({ filtros: { q: 'factura' } }),
      expect.objectContaining({ origen: 'sugerencia' }),
    ]);
  });

  it('pasados 10 minutos, la misma búsqueda vuelve a contar; y la de otra persona cuenta aparte', async () => {
    const { token, usuario, empresa } = await registrarEmpresa(app);
    const persona = await crearUsuarioEn(pool, empresa.id);
    const tokenPersona = await iniciarSesion(app, persona.email, { clave: CLAVE });
    // Un asiento de hace 11 minutos, escrito por el dueño de la base: la aplicación no puede fechar asientos.
    await pool.query(
      `INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion, detalle, creado_en)
       VALUES ($1, $2, 'administrador', 'BUSQUEDA_REALIZADA', $3, now() - interval '11 minutes')`,
      [empresa.id, usuario.id, { filtros: { q: 'guia' }, resultados: 0 }],
    );

    await buscar(token, { q: 'guia' });
    await buscar(tokenPersona, { q: 'guia' });

    expect(await busquedasDe(empresa.id, usuario.id)).toHaveLength(2);
    expect(await busquedasDe(empresa.id, persona.id)).toHaveLength(1);
  });
});
