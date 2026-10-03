import { createHash } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  almacenamientoDePruebas, CLAVE, CorreoDePruebas, crearAppDePruebas, crearUsuarioEn, historialDe, iniciarSesion, MASTER_DE_PRUEBAS,
  registrarEmpresa, tokenDelMaster, UA_IPHONE,
} from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

describe('Recuperación de contraseña por correo (CLAUDE.md v2)', () => {
  let base: BaseDePruebas;
  let pool: pg.Pool;
  let app: ReturnType<typeof crearAppDePruebas>;
  let correo: CorreoDePruebas;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    pool = base.pool;
  });
  afterAll(() => base.cerrar());
  beforeEach(() => {
    correo = new CorreoDePruebas();
    app = crearAppDePruebas(pool, { URL_FRONTEND: 'https://gestion.ejemplo.pe/' }, almacenamientoDePruebas(), correo);
  });

  const pedir = (email: string) => request(app).post('/api/v1/auth/recuperacion').set('User-Agent', UA_IPHONE).send({ email });
  const confirmar = (token: string, claveNueva: string) =>
    request(app).post('/api/v1/auth/recuperacion/confirmar').send({ token, claveNueva });
  const tokenDelCorreo = (indice = -1) => {
    const enlace = correo.enviados.at(indice)!.texto.match(/https:\/\/\S+/)![0];
    return { enlace, token: new URL(enlace).hash.slice(1) };
  };

  it('responde exactamente lo mismo exista o no el correo, y solo envía el enlace si existe', async () => {
    const { usuario } = await registrarEmpresa(app);

    const existe = await pedir(usuario.email);
    const noExiste = await pedir(`nadie.${Date.now()}@ejemplo.pe`);

    expect(existe.status).toBe(202);
    expect(noExiste.status).toBe(202);
    expect(noExiste.body).toEqual(existe.body);
    expect(correo.enviados).toHaveLength(1);
    expect(correo.enviados[0]).toMatchObject({ para: usuario.email, asunto: expect.stringContaining('Recupera tu contraseña') });
  });

  it('el enlace apunta al frontend, lleva el token en el fragmento y la base solo guarda su huella', async () => {
    const { usuario } = await registrarEmpresa(app);

    await pedir(usuario.email);

    const { enlace, token } = tokenDelCorreo();
    expect(enlace).toMatch(/^https:\/\/gestion\.ejemplo\.pe\/restablecer-clave#[\w-]{43}$/);
    const { rows } = await pool.query('SELECT token_hash, expira_en - creada_en AS vigencia FROM recuperaciones_clave WHERE usuario_id = $1', [usuario.id]);
    expect(rows).toEqual([{ token_hash: createHash('sha256').update(token).digest('hex'), vigencia: { hours: 1 } }]);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('define la contraseña nueva, cierra todas las sesiones y registra la solicitud y el cambio', async () => {
    const { usuario, empresa, token: sesion } = await registrarEmpresa(app);
    await pedir(usuario.email);
    const nueva = 'recuperada-por-correo';

    const respuesta = await confirmar(tokenDelCorreo().token, nueva);

    expect(respuesta.status).toBe(204);
    expect((await request(app).get('/api/v1/auth/yo').set('Authorization', `Bearer ${sesion}`)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: usuario.email, clave: CLAVE })).status).toBe(401);
    expect(await iniciarSesion(app, usuario.email, { clave: nueva })).toMatch(/^ey/);
    const asientos = await historialDe(pool, empresa.id);
    expect(asientos.find((fila) => fila.accion === 'RECUPERACION_SOLICITADA')).toMatchObject({
      usuario_id: usuario.id, rol_usuario: 'administrador', es_movil: true, detalle: { enviada: true },
    });
    expect(asientos.find((fila) => fila.accion === 'CLAVE_RESTABLECIDA')).toMatchObject({
      usuario_id: usuario.id, entidad_id: usuario.id, detalle: { sesionesCerradas: 1 },
    });
    expect(JSON.stringify(asientos)).not.toContain(nueva);
    expect(JSON.stringify(asientos)).not.toContain(tokenDelCorreo().token);
  });

  it('un correo desconocido también queda registrado, sin autor ni empresa', async () => {
    const email = `desconocido.${Date.now()}@ejemplo.pe`;

    await pedir(email);

    expect((await historialDe(pool, null)).at(-1)).toMatchObject({
      accion: 'RECUPERACION_SOLICITADA', usuario_id: null, detalle: { email, enviada: false, motivo: 'CORREO_DESCONOCIDO' },
    });
  });

  it('el enlace sirve una sola vez', async () => {
    const { usuario } = await registrarEmpresa(app);
    await pedir(usuario.email);
    const { token } = tokenDelCorreo();

    expect((await confirmar(token, 'primera-clave-nueva')).status).toBe(204);
    const segunda = await confirmar(token, 'segunda-clave-nueva');

    expect(segunda.status).toBe(400);
    expect(segunda.body.error.codigo).toBe('ENLACE_INVALIDO');
  });

  it('pedir otro enlace anula el anterior: solo vale el último', async () => {
    const { usuario } = await registrarEmpresa(app);
    await pedir(usuario.email);
    await pedir(usuario.email);

    expect((await confirmar(tokenDelCorreo(0).token, 'clave-del-primer-enlace')).body.error.codigo).toBe('ENLACE_INVALIDO');
    expect((await confirmar(tokenDelCorreo(1).token, 'clave-del-segundo-enlace')).status).toBe(204);
  });

  it('un enlace caducado no sirve: vale 60 minutos', async () => {
    const { usuario } = await registrarEmpresa(app);
    await pedir(usuario.email);
    await pool.query(
      "UPDATE recuperaciones_clave SET creada_en = creada_en - interval '61 minutes', expira_en = expira_en - interval '61 minutes' WHERE usuario_id = $1",
      [usuario.id],
    );

    const respuesta = await confirmar(tokenDelCorreo().token, 'llega-demasiado-tarde');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('ENLACE_INVALIDO');
  });

  it('una cuenta desactivada no recibe enlace, aunque la respuesta sea la misma', async () => {
    const { empresa } = await registrarEmpresa(app);
    const empleado = await crearUsuarioEn(pool, empresa.id);
    await pool.query('UPDATE usuarios SET activo = false WHERE id = $1', [empleado.id]);

    const respuesta = await pedir(empleado.email);

    expect(respuesta.status).toBe(202);
    expect(correo.enviados).toHaveLength(0);
    expect((await historialDe(pool, empresa.id)).at(-1)).toMatchObject({
      accion: 'RECUPERACION_SOLICITADA', usuario_id: empleado.id, detalle: { enviada: false, motivo: 'USUARIO_INACTIVO' },
    });
  });

  it('un token inventado o una contraseña nueva corta se rechazan con su motivo', async () => {
    expect((await confirmar('x'.repeat(43), 'una-clave-valida')).body.error.codigo).toBe('ENLACE_INVALIDO');
    const corta = await confirmar('x'.repeat(43), 'corta');
    expect(corta.status).toBe(400);
    expect(corta.body.error.detalles).toEqual([{ campo: 'claveNueva', mensaje: 'Usa al menos 8 caracteres' }]);
  });

  it('también vale para el Master, con sus reglas: si la nueva no las cumple, el enlace sigue sirviendo', async () => {
    await tokenDelMaster(app);
    await pedir(MASTER_DE_PRUEBAS.email);
    const { token } = tokenDelCorreo();

    const debil = await confirmar(token, 'solo-diez!');
    expect(debil.status).toBe(400);
    expect(debil.body.error.detalles).toEqual([{ campo: 'claveNueva', mensaje: 'La contraseña del Master necesita al menos 12 caracteres' }]);
    expect((await confirmar(token, MASTER_DE_PRUEBAS.clave)).status).toBe(204);
    expect((await historialDe(pool, null)).at(-1)).toMatchObject({ accion: 'CLAVE_RESTABLECIDA', rol_usuario: 'master' });
  });

  it('frena a quien pide enlaces sin parar: cada uno puede ser un correo', async () => {
    const email = `insistente.${Date.now()}@ejemplo.pe`;

    for (let intento = 1; intento <= 10; intento++) expect((await pedir(email)).status).toBe(202);

    expect((await pedir(email)).status).toBe(429);
  });

  it('si el correo no se puede enviar, la respuesta no cambia y el fallo queda en el registro del servidor', async () => {
    const roto = { enviar: () => Promise.reject(new Error('Brevo no responde')) };
    const conCorreoRoto = crearAppDePruebas(pool, {}, almacenamientoDePruebas(), roto);
    const { usuario } = await registrarEmpresa(conCorreoRoto);
    const errores: unknown[] = [];
    const original = console.error;
    console.error = (...argumentos: unknown[]) => { errores.push(argumentos); };
    try {
      const respuesta = await request(conCorreoRoto).post('/api/v1/auth/recuperacion').send({ email: usuario.email });
      await new Promise((resolver) => setImmediate(resolver));

      expect(respuesta.status).toBe(202);
      expect(errores).toEqual([['[correo] no se pudo enviar el enlace de recuperación:', expect.any(Error)]]);
    } finally {
      console.error = original;
    }
  });
});
