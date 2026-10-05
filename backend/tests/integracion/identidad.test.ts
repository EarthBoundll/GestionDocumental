import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { accesoDeEmpresa } from '../../src/db/acceso.js';
import { contraste, problemaDeColor } from '../../src/modulos/identidad/identidad.color.js';
import {
  crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, registrarEmpresa, tokenDelMaster,
} from '../apoyo/api.js';
import { PDF, PNG } from '../apoyo/archivos.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

type App = ReturnType<typeof crearAppDePruebas>;

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
/** Donde guarda los archivos almacenamientoDePruebas(): para comprobar que un logo viejo se borra. */
const CARPETA_DE_ARCHIVOS = join(tmpdir(), 'gestion-documental-archivos-de-prueba');

describe('El contraste del color de marca (WCAG 2.1)', () => {
  it('calcula la razón de la norma: negro sobre blanco es 21:1, y un color consigo mismo, 1:1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contraste('#1f6f5c', '#1f6f5c')).toBe(1);
    // El verde de los botones de la plataforma (teal-700), con texto blanco: pasa.
    expect(contraste('#00786f', '#ffffff')).toBeGreaterThan(4.5);
  });

  it('acepta un color que deja leer el texto blanco y rechaza uno claro, diciendo por qué', () => {
    expect(problemaDeColor('#1f6f5c')).toBeNull();
    expect(problemaDeColor('#ffd700')).toMatch(/^Con texto blanco encima se lee mal \(1\.4:1; hace falta 4\.5:1\)\. Elige un tono más oscuro$/);
  });
});

/** RF31 y RF32: la identidad de cada empresa y el tema de cada persona. */
describe('Identidad visual y tema (RF31, RF32)', () => {
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
  const perfil = async (token: string) => (await request(app).get('/api/v1/auth/yo').set(conToken(token))).body;
  const editar = (token: string, cuerpo: object) => request(app).patch('/api/v1/empresa/identidad').set(conToken(token)).send(cuerpo);
  const subirLogo = (token: string, contenido: Buffer, nombre: string, ruta = '/api/v1/empresa/identidad/logo') =>
    request(app).put(ruta).set(conToken(token)).attach('archivo', contenido, nombre);
  const rutaDelLogo = async (empresaId: string) =>
    (await pool.query<{ logo_ruta: string | null }>('SELECT logo_ruta FROM empresas WHERE id = $1', [empresaId])).rows[0]!.logo_ruta;

  describe('la identidad de la empresa', () => {
    it('nace vacía: la empresa se ve con su razón social y el color de la plataforma', async () => {
      const { token, empresa } = await registrarEmpresa(app);

      expect((await perfil(token)).empresa).toEqual({
        id: empresa.id, nombre: empresa.nombre, marca: { nombreComercial: null, colorPrimario: null, logoUrl: null },
      });
    });

    it('el administrador la cambia, queda en el historial con el antes y el después, y su equipo la ve al entrar', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);
      const persona = await crearUsuarioEn(pool, empresa.id);

      const respuesta = await editar(admin, { nombreComercial: 'Textiles Andinos', colorPrimario: '#1F6F5C' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ nombreComercial: 'Textiles Andinos', colorPrimario: '#1f6f5c', logoUrl: null });
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'EMPRESA_EDITADA', rol_usuario: 'administrador', entidad_tipo: 'empresa', entidad_id: empresa.id,
        detalle: { cambios: { nombreComercial: { antes: null, despues: 'Textiles Andinos' }, colorPrimario: { antes: null, despues: '#1f6f5c' } } },
      });
      expect((await perfil(await iniciarSesion(app, persona.email))).empresa.marca)
        .toEqual({ nombreComercial: 'Textiles Andinos', colorPrimario: '#1f6f5c', logoUrl: null });
    });

    it('rechaza un color que no deja leer el texto blanco de los botones, o que no es un color', async () => {
      const { token: admin } = await registrarEmpresa(app);

      const claro = await editar(admin, { colorPrimario: '#ffd700' });
      const raro = await editar(admin, { colorPrimario: 'verde' });

      expect(claro.status).toBe(400);
      expect(claro.body.error.detalles).toEqual([{ campo: 'colorPrimario', mensaje: expect.stringMatching(/Elige un tono más oscuro$/) }]);
      expect(raro.body.error.detalles[0]).toMatchObject({ campo: 'colorPrimario', mensaje: 'Usa un color en formato #1f6f5c' });
    });

    it('vacío vuelve a lo de antes, y sin cambios no deja asiento', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);
      await editar(admin, { nombreComercial: 'Textiles Andinos', colorPrimario: '#1f6f5c' });
      const antes = (await historialDe(pool, empresa.id)).length;

      expect((await editar(admin, { colorPrimario: '#1f6f5c' })).status).toBe(200);
      expect((await historialDe(pool, empresa.id)).length).toBe(antes);
      expect((await editar(admin, { nombreComercial: '', colorPrimario: '' })).body)
        .toEqual({ nombreComercial: null, colorPrimario: null, logoUrl: null });
    });

    it('un usuario la ve pero no la cambia: 403 registrado, como cualquier acceso denegado', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);
      await editar(admin, { colorPrimario: '#1f6f5c' });
      const usuario = await iniciarSesion(app, (await crearUsuarioEn(pool, empresa.id)).email);

      expect((await request(app).get('/api/v1/empresa/identidad').set(conToken(usuario))).body.colorPrimario).toBe('#1f6f5c');
      expect((await editar(usuario, { colorPrimario: '#000000' })).status).toBe(403);
      expect((await subirLogo(usuario, PNG, 'logo.png')).status).toBe(403);
      expect((await request(app).delete('/api/v1/empresa/identidad/logo').set(conToken(usuario))).status).toBe(403);
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'ACCESO_DENEGADO', detalle: { permiso: 'GESTIONAR_IDENTIDAD' } });
      expect((await perfil(admin)).empresa.marca.colorPrimario).toBe('#1f6f5c');
    });

    it('cada empresa cambia solo la suya: la ruta no recibe empresa, la toma de la sesión', async () => {
      const a = await registrarEmpresa(app);
      const b = await registrarEmpresa(app);

      await request(app).patch('/api/v1/empresa/identidad').query({ empresaId: b.empresa.id }).set(conToken(a.token))
        .send({ colorPrimario: '#7a1f1f', empresaId: b.empresa.id });

      expect((await perfil(a.token)).empresa.marca.colorPrimario).toBe('#7a1f1f');
      expect((await perfil(b.token)).empresa.marca.colorPrimario).toBeNull();
    });
  });

  describe('el logo', () => {
    it('se sube como PNG o JPG, se sirve con un enlace firmado y el anterior se borra al cambiarlo', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);

      const primero = await subirLogo(admin, PNG, 'logo.png');
      const rutaPrimera = await rutaDelLogo(empresa.id);
      const segundo = await subirLogo(admin, JPG, 'logo.jpg');

      expect(primero.status).toBe(200);
      expect(primero.body.logoUrl).toMatch(new RegExp(`/api/v1/archivos/${empresa.id}/[0-9a-f-]{36}\\.png\\?`));
      expect(segundo.body.logoUrl).toMatch(/\.jpg\?/);
      expect(existsSync(join(CARPETA_DE_ARCHIVOS, rutaPrimera!))).toBe(false);
      expect(existsSync(join(CARPETA_DE_ARCHIVOS, (await rutaDelLogo(empresa.id))!))).toBe(true);
      expect((await perfil(admin)).empresa.marca.logoUrl).toMatch(/\.jpg\?/);
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
        accion: 'EMPRESA_EDITADA', detalle: { cambios: { logo: { antes: true, despues: true } }, archivo: 'logo.jpg' },
      });
    });

    it('rechaza lo que no es una imagen admitida, aunque lo diga su nombre, y lo que pesa demasiado', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);

      expect((await subirLogo(admin, PDF, 'logo.png')).status).toBe(415);
      expect((await subirLogo(admin, PNG, 'logo.gif')).status).toBe(415);
      expect((await subirLogo(admin, Buffer.from('<svg onload="alert(1)"/>'), 'logo.svg')).status).toBe(415);
      const pesado = await subirLogo(admin, Buffer.concat([PNG, Buffer.alloc(300 * 1024)]), 'logo.png');
      expect(pesado.status).toBe(413);
      expect(pesado.body.error.mensaje).toBe('El logo supera los 256 KB');
      expect(await rutaDelLogo(empresa.id)).toBeNull();
    });

    it('quitarlo borra el archivo y lo deja en el historial', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);
      await subirLogo(admin, PNG, 'logo.png');
      const ruta = await rutaDelLogo(empresa.id);

      const respuesta = await request(app).delete('/api/v1/empresa/identidad/logo').set(conToken(admin));

      expect(respuesta.body.logoUrl).toBeNull();
      expect(existsSync(join(CARPETA_DE_ARCHIVOS, ruta!))).toBe(false);
      expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({ accion: 'EMPRESA_EDITADA', detalle: { cambios: { logo: { antes: true, despues: false } } } });
    });
  });

  describe('el Master', () => {
    it('da identidad a cualquier empresa desde la plataforma; queda en el historial de esa empresa como suyo', async () => {
      const master = await tokenDelMaster(app);
      const { token: admin, empresa } = await registrarEmpresa(app);

      const editada = await request(app).patch(`/api/v1/plataforma/empresas/${empresa.id}/identidad`).set(conToken(master))
        .send({ nombreComercial: 'Andinos', colorPrimario: '#1f3a6f' });
      const logo = await subirLogo(master, PNG, 'logo.png', `/api/v1/plataforma/empresas/${empresa.id}/identidad/logo`);

      expect(editada.status).toBe(200);
      expect(logo.status).toBe(200);
      expect((await request(app).get(`/api/v1/plataforma/empresas/${empresa.id}`).set(conToken(master))).body.marca)
        .toMatchObject({ nombreComercial: 'Andinos', colorPrimario: '#1f3a6f', logoUrl: expect.stringMatching(/\.png\?/) });
      expect((await historialDe(pool, empresa.id)).filter((a) => a.accion === 'EMPRESA_EDITADA').map((a) => a.rol_usuario))
        .toEqual(['master', 'master']);
      expect((await perfil(admin)).empresa.marca.colorPrimario).toBe('#1f3a6f');
    });

    it('un administrador de empresa no usa la puerta del Master, ni siquiera para la suya', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);

      expect((await request(app).patch(`/api/v1/plataforma/empresas/${empresa.id}/identidad`).set(conToken(admin))
        .send({ colorPrimario: '#1f3a6f' })).status).toBe(403);
    });

    it('una empresa que no existe responde 404', async () => {
      const master = await tokenDelMaster(app);

      expect((await request(app).patch('/api/v1/plataforma/empresas/00000000-0000-0000-0000-000000000000/identidad')
        .set(conToken(master)).send({ colorPrimario: '#1f3a6f' })).status).toBe(404);
    });
  });

  describe('la base lo impide aunque el código se equivocara (008)', () => {
    const intentar = (empresaId: string, persona: { id: string; rol: 'administrador' | 'usuario' }, sql: string) =>
      accesoDeEmpresa(pool, empresaId, { usuarioId: persona.id, rol: persona.rol }).ejecutar(async (db) => (await db.query(sql)).rowCount);

    it('un usuario no actualiza su empresa, y un administrador no actualiza otra', async () => {
      const a = await registrarEmpresa(app);
      const b = await registrarEmpresa(app);
      const usuario = await crearUsuarioEn(pool, a.empresa.id);

      expect(await intentar(a.empresa.id, { id: usuario.id, rol: 'usuario' }, "UPDATE empresas SET color_primario = '#000000'")).toBe(0);
      expect(await intentar(a.empresa.id, { id: a.usuario.id, rol: 'administrador' },
        `UPDATE empresas SET color_primario = '#000000' WHERE id = '${b.empresa.id}'`)).toBe(0);
      expect(await intentar(a.empresa.id, { id: a.usuario.id, rol: 'administrador' }, "UPDATE empresas SET color_primario = '#000000'")).toBe(1);
      expect((await pool.query('SELECT color_primario FROM empresas WHERE id = $1', [b.empresa.id])).rows[0].color_primario).toBeNull();
    });

    it('ni el administrador cambia la razón social, el RUC o el estado: esas columnas son del Master', async () => {
      const { empresa, usuario } = await registrarEmpresa(app);

      for (const sql of ["UPDATE empresas SET nombre = 'Otra'", "UPDATE empresas SET activa = false", "UPDATE empresas SET ruc = '20123456789'"]) {
        await expect(intentar(empresa.id, { id: usuario.id, rol: 'administrador' }, sql)).rejects.toMatchObject({ code: '42501' });
      }
    });

    it('un logo solo puede estar en la carpeta de su empresa', async () => {
      const a = await registrarEmpresa(app);
      const b = await registrarEmpresa(app);

      await expect(intentar(a.empresa.id, { id: a.usuario.id, rol: 'administrador' },
        `UPDATE empresas SET logo_ruta = '${b.empresa.id}/00000000-0000-0000-0000-000000000000.png'`))
        .rejects.toMatchObject({ code: '23514', constraint: 'empresas_logo_en_su_carpeta' });
    });
  });

  describe('el tema de cada persona (RF32)', () => {
    it('empieza en el del dispositivo, se guarda en la cuenta y no pasa por el historial', async () => {
      const { token, empresa } = await registrarEmpresa(app);
      expect((await perfil(token)).usuario.tema).toBe('sistema');
      // Lo único que se registra aquí es el inicio de sesión de la segunda prueba.
      const sinSesiones = async () => (await historialDe(pool, empresa.id)).filter((a) => a.accion !== 'SESION_INICIADA').length;
      const antes = await sinSesiones();

      const respuesta = await request(app).put('/api/v1/auth/preferencias').set(conToken(token)).send({ tema: 'oscuro' });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ tema: 'oscuro' });
      expect((await perfil(token)).usuario.tema).toBe('oscuro');
      // Sigue a la persona: otra sesión, otro dispositivo, el mismo tema.
      const otra = await request(app).post('/api/v1/auth/login').send({ email: (await perfil(token)).usuario.email, clave: 'clave-de-prueba-1' });
      expect(otra.body.usuario.tema).toBe('oscuro');
      expect(await sinSesiones()).toBe(antes);
    });

    it('cada uno cambia solo el suyo, también el Master; un valor que no existe es un 400', async () => {
      const { token: admin, empresa } = await registrarEmpresa(app);
      const persona = await crearUsuarioEn(pool, empresa.id);
      const master = await tokenDelMaster(app);

      await request(app).put('/api/v1/auth/preferencias').set(conToken(admin)).send({ tema: 'claro' });
      expect((await request(app).put('/api/v1/auth/preferencias').set(conToken(master)).send({ tema: 'oscuro' })).status).toBe(200);
      expect((await request(app).put('/api/v1/auth/preferencias').set(conToken(admin)).send({ tema: 'rosado' })).status).toBe(400);

      expect((await perfil(admin)).usuario.tema).toBe('claro');
      expect((await perfil(await iniciarSesion(app, persona.email))).usuario.tema).toBe('sistema');
      expect((await perfil(master)).usuario.tema).toBe('oscuro');
    });
  });
});
