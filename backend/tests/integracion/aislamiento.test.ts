import { writeFile } from 'node:fs/promises';
import { SignJWT } from 'jose';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CLAVE, crearAppDePruebas, crearUsuarioEn, iniciarSesion, registrarEmpresa, SECRETO_DE_PRUEBAS, tokenDelMaster,
} from '../apoyo/api.js';
import { PDF } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/*
 * CLAUDE.md v2: «Probar explícitamente que un usuario de la empresa A no puede leer, modificar ni
 * descargar nada de la empresa B». Cada intento se anota, y con INFORME_AISLAMIENTO=<ruta> la batería
 * deja un informe en Markdown: la evidencia del indicador 6 (npm run informe:aislamiento).
 */

interface Intento {
  quien: string;
  operacion: string;
  metodo: string;
  ruta: string;
  esperado: string;
  obtenido: number;
  correcto: boolean;
}

const intentos: Intento[] = [];

describe('Aislamiento entre empresas: A no alcanza nada de B (indicador 6)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;

  // Empresa B, con algo de todo.
  const b = {} as {
    empresaId: string; adminId: string; adminToken: string; usuarioId: string; usuarioToken: string;
    categoriaId: string; documentoId: string; documentoNombre: string; solicitudId: string; notificacionId: string; medicionId: string;
  };
  // Empresa A: un administrador y un usuario, que son quienes atacan.
  const a = {} as { empresaId: string; adminToken: string; usuarioToken: string };

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
    app = crearAppDePruebas(pool);

    const empresaA = await registrarEmpresa(app);
    a.empresaId = empresaA.empresa.id;
    a.adminToken = empresaA.token;
    a.usuarioToken = await iniciarSesion(app, (await crearUsuarioEn(pool, a.empresaId)).email);

    const empresaB = await registrarEmpresa(app);
    b.empresaId = empresaB.empresa.id;
    b.adminId = empresaB.usuario.id;
    b.adminToken = empresaB.token;
    const usuarioB = await crearUsuarioEn(pool, b.empresaId);
    b.usuarioId = usuarioB.id;
    b.usuarioToken = await iniciarSesion(app, usuarioB.email);
    const segundoAdminB = await crearUsuarioEn(pool, b.empresaId, 'administrador');
    const segundoAdminToken = await iniciarSesion(app, segundoAdminB.email);

    b.categoriaId = (await comoB(b.adminToken).post('/api/v1/categorias').send({ nombre: 'Confidencial de B' })).body.id;
    b.documentoNombre = 'Contrato secreto de la empresa B';
    const subido = await request(app).post('/api/v1/documentos').set('Authorization', `Bearer ${b.adminToken}`)
      .field('nombre', b.documentoNombre).field('categoriaId', b.categoriaId).field('fechaDocumento', '2026-09-15')
      .attach('archivo', PDF, 'contrato-b.pdf');
    b.documentoId = subido.body.id;
    b.solicitudId = (await comoB(b.adminToken).post(`/api/v1/documentos/${b.documentoId}/solicitudes`).send({})).body.id;
    const avisos = await comoB(segundoAdminToken).get('/api/v1/notificaciones');
    b.notificacionId = avisos.body.datos[0].id;
    b.medicionId = (await comoB(b.usuarioToken).get('/api/v1/documentos')).body.tiempoRespuestaId;
    for (const valor of Object.values(b)) if (!valor) throw new Error('El escenario de la empresa B quedó incompleto');
  });

  afterAll(async () => {
    const ruta = process.env.INFORME_AISLAMIENTO;
    if (ruta && intentos.length > 0) await writeFile(ruta, informe(intentos));
    await base.cerrar();
  });

  function comoB(token: string) {
    return {
      get: (ruta: string) => request(app).get(ruta).set('Authorization', `Bearer ${token}`),
      post: (ruta: string) => request(app).post(ruta).set('Authorization', `Bearer ${token}`),
    };
  }

  /** Hace la petición, la anota para el informe y devuelve la respuesta. */
  async function intentar(quien: 'administrador de A' | 'usuario de A', operacion: string, metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    ruta: string, cuerpo?: object) {
    const token = quien === 'administrador de A' ? a.adminToken : a.usuarioToken;
    let peticion = request(app)[metodo.toLowerCase() as 'get'](ruta).set('Authorization', `Bearer ${token}`);
    if (cuerpo) peticion = peticion.send(cuerpo);
    const respuesta = await peticion;
    return respuesta;
  }

  function anotar(intento: Omit<Intento, 'correcto'>, correcto: boolean) {
    intentos.push({ ...intento, correcto });
  }

  // Un recurso de otra empresa no existe para quien pregunta: 404, igual que un id inventado. Un 403
  // revelaría que existe. Para el usuario, las rutas de administración responden 403 antes de mirar nada.
  const ataquesDirectos = (): [string, 'GET' | 'POST' | 'PATCH' | 'DELETE', string, object | undefined][] => [
    ['ver la ficha de un documento', 'GET', `/api/v1/documentos/${b.documentoId}`, undefined],
    ['ver el archivo de un documento', 'GET', `/api/v1/documentos/${b.documentoId}/archivo`, undefined],
    ['descargar el archivo de un documento', 'GET', `/api/v1/documentos/${b.documentoId}/archivo?modo=descargar`, undefined],
    ['ver la actividad de un documento', 'GET', `/api/v1/documentos/${b.documentoId}/actividad`, undefined],
    ['editar un documento', 'PATCH', `/api/v1/documentos/${b.documentoId}`, { nombre: 'Lo cambió A' }],
    ['eliminar un documento', 'DELETE', `/api/v1/documentos/${b.documentoId}`, undefined],
    ['pedir la aprobación de un documento', 'POST', `/api/v1/documentos/${b.documentoId}/solicitudes`, {}],
    ['marcar como leída una notificación', 'PATCH', `/api/v1/notificaciones/${b.notificacionId}/leida`, undefined],
    ['completar una medición de tiempo de respuesta', 'PATCH', `/api/v1/tiempos-respuesta/${b.medicionId}`, { duracionClienteMs: 1 }],
  ];
  const ataquesDeAdministracion = (): [string, 'GET' | 'POST' | 'PATCH' | 'DELETE', string, object | undefined][] => [
    ['editar una categoría', 'PATCH', `/api/v1/categorias/${b.categoriaId}`, { nombre: 'Lo cambió A' }],
    ['editar un usuario', 'PATCH', `/api/v1/usuarios/${b.usuarioId}`, { nombre: 'Lo cambió A' }],
    ['desactivar un usuario', 'PATCH', `/api/v1/usuarios/${b.usuarioId}/estado`, { activo: false }],
    ['restablecer la contraseña de un administrador', 'PATCH', `/api/v1/usuarios/${b.adminId}`, { clave: 'clave-puesta-por-a' }],
    ['resolver una solicitud de aprobación', 'POST', `/api/v1/solicitudes/${b.solicitudId}/resolucion`, { decision: 'aprobada' }],
  ];

  // Las rutas del Master reciben la empresa en la URL: para cualquiera de una empresa, la puerta se cierra antes.
  const ataquesPorLaPlataforma = (): [string, 'GET' | 'PATCH' | 'DELETE', string, object | undefined][] => [
    ['ver la ficha de B en la plataforma', 'GET', `/api/v1/plataforma/empresas/${b.empresaId}`, undefined],
    ['cambiar la identidad de B por la ruta del Master', 'PATCH', `/api/v1/plataforma/empresas/${b.empresaId}/identidad`, { colorPrimario: '#000000' }],
    ['quitar el logo de B por la ruta del Master', 'DELETE', `/api/v1/plataforma/empresas/${b.empresaId}/identidad/logo`, undefined],
  ];

  describe.each(['administrador de A', 'usuario de A'] as const)('el %s', (quien) => {
    it('no puede leer, modificar ni descargar ningún recurso de B por su id: 404, como si no existiera', async () => {
      for (const [operacion, metodo, ruta, cuerpo] of ataquesDirectos()) {
        const respuesta = await intentar(quien, operacion, metodo, ruta, cuerpo);
        anotar({ quien, operacion, metodo, ruta, esperado: '404', obtenido: respuesta.status }, respuesta.status === 404);
        expect.soft(respuesta.status, `${operacion} (${metodo} ${ruta})`).toBe(404);
      }
    });

    it('ni por la puerta del Master: 403, y queda registrado', async () => {
      for (const [operacion, metodo, ruta, cuerpo] of ataquesPorLaPlataforma()) {
        const respuesta = await intentar(quien, operacion, metodo, ruta, cuerpo);
        anotar({ quien, operacion, metodo, ruta, esperado: '403', obtenido: respuesta.status }, respuesta.status === 403);
        expect.soft(respuesta.status, `${operacion} (${metodo} ${ruta})`).toBe(403);
      }
    });

    it('tampoco con las rutas de administración: 404 al administrador, 403 al usuario', async () => {
      const esperado = quien === 'administrador de A' ? 404 : 403;
      for (const [operacion, metodo, ruta, cuerpo] of ataquesDeAdministracion()) {
        const respuesta = await intentar(quien, operacion, metodo, ruta, cuerpo);
        anotar({ quien, operacion, metodo, ruta, esperado: String(esperado), obtenido: respuesta.status }, respuesta.status === esperado);
        expect.soft(respuesta.status, `${operacion} (${metodo} ${ruta})`).toBe(esperado);
      }
    });
  });

  it('nada de B cambió tras todos los intentos', async () => {
    const { rows: [documento] } = await pool.query('SELECT nombre, eliminado_en FROM documentos WHERE id = $1', [b.documentoId]);
    const { rows: [categoria] } = await pool.query('SELECT nombre FROM categorias WHERE id = $1', [b.categoriaId]);
    const { rows: [usuario] } = await pool.query('SELECT nombre, activo FROM usuarios WHERE id = $1', [b.usuarioId]);
    const { rows: [solicitud] } = await pool.query('SELECT estado FROM solicitudes WHERE id = $1', [b.solicitudId]);
    const { rows: [aviso] } = await pool.query('SELECT leida_en FROM notificaciones WHERE id = $1', [b.notificacionId]);
    const { rows: [medicion] } = await pool.query('SELECT duracion_cliente_ms FROM tiempos_respuesta WHERE id = $1', [b.medicionId]);
    const { rows: solicitudesDeB } = await pool.query('SELECT 1 FROM solicitudes WHERE documento_id = $1', [b.documentoId]);
    const { rows: [identidad] } = await pool.query('SELECT nombre_comercial, color_primario, logo_ruta FROM empresas WHERE id = $1', [b.empresaId]);

    expect(documento).toEqual({ nombre: b.documentoNombre, eliminado_en: null });
    expect(categoria).toEqual({ nombre: 'Confidencial de B' });
    expect(usuario).toMatchObject({ activo: true });
    expect(usuario.nombre).not.toBe('Lo cambió A');
    expect(solicitud).toEqual({ estado: 'pendiente' });
    expect(aviso).toEqual({ leida_en: null });
    expect(medicion).toEqual({ duracion_cliente_ms: null });
    expect(solicitudesDeB).toHaveLength(1);
    expect(identidad).toEqual({ nombre_comercial: null, color_primario: null, logo_ruta: null });
    expect(await iniciarSesion(app, (await pool.query('SELECT email FROM usuarios WHERE id = $1', [b.adminId])).rows[0].email))
      .toMatch(/^ey/);
  });

  describe('los listados y búsquedas de A no traen nada de B', () => {
    const listados = (): [string, string, (cuerpo: { datos: unknown[] }) => string[]][] => [
      ['listar documentos', '/api/v1/documentos', (c) => ids(c.datos)],
      ['buscar documentos por el nombre exacto de uno de B', `/api/v1/documentos?q=${encodeURIComponent('Contrato secreto de la empresa B')}`, (c) => ids(c.datos)],
      ['buscar documentos por una categoría de B', `/api/v1/documentos?categoriaId=${b.categoriaId}`, (c) => ids(c.datos)],
      ['listar categorías, también las inactivas', '/api/v1/categorias?incluirInactivas=true', (c) => ids(c.datos)],
      ['listar usuarios', '/api/v1/usuarios?porPagina=100', (c) => ids(c.datos)],
      ['listar solicitudes', '/api/v1/solicitudes', (c) => ids(c.datos)],
      ['listar notificaciones', '/api/v1/notificaciones', (c) => ids(c.datos)],
      ['consultar el historial de un usuario de B', `/api/v1/historial?usuarioId=${b.usuarioId}`, (c) => ids(c.datos)],
      ['consultar el historial de un documento de B', `/api/v1/historial?entidadTipo=documento&entidadId=${b.documentoId}`, (c) => ids(c.datos)],
    ];

    it('el administrador de A lista y busca: ningún id ni dato de B aparece', async () => {
      const deB = [b.documentoId, b.categoriaId, b.usuarioId, b.adminId, b.solicitudId, b.notificacionId, b.empresaId];
      for (const [operacion, ruta, extraer] of listados()) {
        const respuesta = await intentar('administrador de A', operacion, 'GET', ruta);
        const fuga = respuesta.status === 200 && (extraer(respuesta.body).some((id) => deB.includes(id))
          || JSON.stringify(respuesta.body).includes(b.documentoNombre) || JSON.stringify(respuesta.body).includes(b.empresaId));
        anotar({ quien: 'administrador de A', operacion, metodo: 'GET', ruta: ruta.split('?')[0]!, esperado: '200 sin datos de B', obtenido: respuesta.status }, respuesta.status === 200 && !fuga);
        expect.soft(respuesta.status, operacion).toBe(200);
        expect.soft(fuga, `${operacion}: aparecen datos de B`).toBe(false);
      }
    });

    // El historial de A sí contiene ids de B: los que A escribió en sus propios intentos (la ruta de un acceso
    // denegado, el filtro de una búsqueda). Lo que no puede contener es ni un solo asiento de B.
    it('el historial exportado de A contiene exactamente los asientos de A, ninguno de B', async () => {
      const { rows } = await pool.query<{ id: string }>('SELECT id::text AS id FROM historial WHERE empresa_id = $1', [a.empresaId]);
      const respuesta = await intentar('administrador de A', 'exportar el historial', 'GET', '/api/v1/historial/exportar');
      const exportados = respuesta.text.replace(/^\uFEFF/, '').split('\r\n').slice(1).filter(Boolean).map((linea) => linea.split(',')[0]!);
      const fuga = exportados.length !== rows.length || exportados.some((id) => !rows.some((fila) => fila.id === id));
      anotar({ quien: 'administrador de A', operacion: 'exportar el historial en CSV', metodo: 'GET', ruta: '/api/v1/historial/exportar', esperado: '200, solo asientos de A', obtenido: respuesta.status }, respuesta.status === 200 && !fuga);

      expect(respuesta.status).toBe(200);
      expect(fuga).toBe(false);
    });
  });

  describe('la empresa sale de la identidad, nunca de lo que envía el cliente', () => {
    it('un empresaId en el cuerpo o en la URL se ignora: lo creado queda en A', async () => {
      const categoria = await request(app).post(`/api/v1/categorias?empresaId=${b.empresaId}&empresa_id=${b.empresaId}`)
        .set('Authorization', `Bearer ${a.adminToken}`).send({ nombre: `Plantada por A ${Date.now()}`, empresaId: b.empresaId, empresa_id: b.empresaId });
      const usuario = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${a.adminToken}`)
        .send({ nombre: 'Infiltrado', email: `infiltrado.${Date.now()}@ejemplo.pe`, clave: CLAVE, rol: 'usuario', empresaId: b.empresaId });
      const documento = await request(app).post(`/api/v1/documentos?empresaId=${b.empresaId}`).set('Authorization', `Bearer ${a.adminToken}`)
        .field('nombre', 'Subido por A').field('categoriaId', categoria.body.id).field('fechaDocumento', '2026-09-15')
        .field('empresaId', b.empresaId).attach('archivo', PDF, 'a.pdf');
      const listado = await request(app).get(`/api/v1/documentos?empresaId=${b.empresaId}`).set('Authorization', `Bearer ${a.adminToken}`);

      const empresaDe = async (tabla: string, id: string) =>
        (await pool.query<{ empresa_id: string }>(`SELECT empresa_id FROM ${tabla} WHERE id = $1`, [id])).rows[0]?.empresa_id;
      const correcto = await empresaDe('categorias', categoria.body.id) === a.empresaId
        && await empresaDe('usuarios', usuario.body.id) === a.empresaId
        && await empresaDe('documentos', documento.body.id) === a.empresaId
        && !ids(listado.body.datos).includes(b.documentoId);
      anotar({ quien: 'administrador de A', operacion: 'crear y listar enviando el empresaId de B', metodo: 'POST', ruta: '/api/v1/categorias, /usuarios, /documentos', esperado: 'todo queda en A', obtenido: categoria.status }, correcto);

      expect(await empresaDe('categorias', categoria.body.id)).toBe(a.empresaId);
      expect(await empresaDe('usuarios', usuario.body.id)).toBe(a.empresaId);
      expect(await empresaDe('documentos', documento.body.id)).toBe(a.empresaId);
      expect(ids(listado.body.datos)).not.toContain(b.documentoId);
    });

    it('ni siquiera con el secreto de firma: un token con la empresa cambiada se rechaza', async () => {
      const [, carga] = a.adminToken.split('.');
      const { sub, jti, exp } = JSON.parse(Buffer.from(carga!, 'base64url').toString());
      const falsificado = await new SignJWT({ empresa_id: b.empresaId, rol: 'administrador' })
        .setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setJti(jti).setIssuedAt().setExpirationTime(exp)
        .sign(new TextEncoder().encode(SECRETO_DE_PRUEBAS));

      const respuesta = await request(app).get(`/api/v1/documentos/${b.documentoId}`).set('Authorization', `Bearer ${falsificado}`);
      anotar({ quien: 'administrador de A', operacion: 'usar un token firmado con la empresa de B', metodo: 'GET', ruta: '/api/v1/documentos/:id', esperado: '401', obtenido: respuesta.status }, respuesta.status === 401);

      expect(respuesta.status).toBe(401);
    });
  });

  it('el Master tampoco lee el contenido de B: ni documentos ni sus archivos (decisión E)', async () => {
    const master = await tokenDelMaster(app);
    for (const ruta of [`/api/v1/documentos/${b.documentoId}`, `/api/v1/documentos/${b.documentoId}/archivo?modo=descargar`, `/api/v1/documentos/${b.documentoId}/actividad`, '/api/v1/documentos']) {
      const respuesta = await request(app).get(ruta).set('Authorization', `Bearer ${master}`);
      anotar({ quien: 'Administrador Master', operacion: 'leer documentos de una empresa', metodo: 'GET', ruta: ruta.split('?')[0]!.replace(b.documentoId, ':id'), esperado: '403', obtenido: respuesta.status }, respuesta.status === 403);
      expect.soft(respuesta.status, ruta).toBe(403);
    }
  });
});

function ids(datos: unknown[] | undefined): string[] {
  return (datos ?? []).map((fila) => (fila as { id: string }).id);
}

function informe(lista: Intento[]): string {
  const correctos = lista.filter((intento) => intento.correcto).length;
  const filas = lista.map((intento, n) =>
    `| ${n + 1} | ${intento.quien} | ${intento.operacion} | \`${intento.metodo} ${intento.ruta.replace(/[0-9a-f-]{36}/g, ':id')}\` | ${intento.esperado} | ${intento.obtenido} | ${intento.correcto ? 'Sí' : '**NO**'} |`);
  return [
    '# Informe de aislamiento entre empresas',
    '',
    `Generado el ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })} (hora de Lima) por \`npm run informe:aislamiento\`,`,
    'a partir de la batería `tests/integracion/aislamiento.test.ts`, contra un PostgreSQL 17 real con las migraciones del proyecto.',
    '',
    'La empresa B tiene un documento con su archivo, una categoría, usuarios, una solicitud pendiente, una notificación y una',
    'medición de tiempo de respuesta. Desde la empresa A se intenta leer, modificar y descargar cada cosa por su id, encontrarla',
    'en listados y búsquedas, y colarse enviando el `empresaId` de B o falsificando el token.',
    '',
    `**Resultado: ${correctos} de ${lista.length} intentos con la respuesta correcta (${((correctos / lista.length) * 100).toFixed(1)} %).**`,
    '',
    '| # | Quién | Intento | Petición | Esperado | Obtenido | Correcto |',
    '|---|---|---|---|---|---|---|',
    ...filas,
    '',
    'Un recurso de otra empresa responde 404, igual que uno inexistente: un 403 confirmaría que existe. Las rutas de',
    'administración responden 403 a un usuario sin ese permiso antes de mirar ningún recurso.',
    '',
  ].join('\n');
}
