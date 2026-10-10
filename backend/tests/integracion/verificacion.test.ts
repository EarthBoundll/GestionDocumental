import { createHash } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashearClave } from '../../src/compartido/claves.js';
import { esCorreoDesechable } from '../../src/compartido/correos-desechables.js';
import { accesoDeEmpresa } from '../../src/db/acceso.js';
import {
  activarCuenta, almacenamientoDePruebas, CLAVE, CorreoDePruebas, crearAppDePruebas, entornoDePruebas, historialDe, iniciarSesion,
  registrarEmpresa, tokenDelMaster, tokenDelUltimoEnlace,
} from '../apoyo/api.js';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';

/**
 * D41: las cuentas nuevas nacen pendientes y sin contraseña, y solo entran cuando su dueño acepta la
 * invitación que le llega por correo. Cada caso de la lista del pedido tiene aquí su prueba.
 */
describe('Verificación del correo por invitación (D41)', () => {
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
    app = crearAppDePruebas(pool, { URL_FRONTEND: 'https://gestion.ejemplo.pe' }, almacenamientoDePruebas(), correo);
  });

  let secuencia = 0;
  const nuevoCorreo = () => `persona${++secuencia}.${Date.now()}@ejemplo.pe`;
  const con = (token: string) => ({ Authorization: `Bearer ${token}` });
  const crearUsuario = (token: string, datos: object) => request(app).post('/api/v1/usuarios').set(con(token)).send({ nombre: 'Luis Quispe', rol: 'usuario', ...datos });
  const reenviar = (token: string, id: string) => request(app).post(`/api/v1/usuarios/${id}/invitacion`).set(con(token));
  const activar = (token: string, claveNueva = CLAVE) => request(app).post('/api/v1/auth/activacion').send({ token, claveNueva });
  const verificar = (token: string) => request(app).post('/api/v1/auth/verificacion').send({ token });
  const login = (email: string, clave = CLAVE) => request(app).post('/api/v1/auth/login').send({ email, clave });
  const estadoDe = async (id: string) =>
    (await pool.query<{ verificado: boolean; tiene_clave: boolean }>(
      'SELECT email_verificado_en IS NOT NULL AS verificado, clave_hash IS NOT NULL AS tiene_clave FROM usuarios WHERE id = $1', [id],
    )).rows[0];

  /** Un usuario recién creado por su administrador, todavía pendiente. */
  async function invitado() {
    const sesion = await registrarEmpresa(app);
    const email = nuevoCorreo();
    const creado = await crearUsuario(sesion.token, { email });
    return { ...sesion, admin: sesion.token, email, id: creado.body.id as string, respuesta: creado };
  }

  describe('crear la cuenta y aceptar la invitación', () => {
    it('1 y 2 · con un correo válido, la cuenta nace pendiente y sin contraseña, y le llega su invitación', async () => {
      const { respuesta, email, admin } = await invitado();

      expect(respuesta.status).toBe(201);
      expect(respuesta.body).toMatchObject({ email, estado: 'pendiente', invitacionEnviada: true });
      expect(await estadoDe(respuesta.body.id)).toEqual({ verificado: false, tiene_clave: false });
      const invitacion = correo.enviados.findLast((mensaje) => mensaje.para === email)!;
      expect(invitacion.asunto).toMatch(/^Activa tu cuenta de Empresa de prueba \d+/);
      expect(invitacion.texto).toMatch(/https:\/\/gestion\.ejemplo\.pe\/activar-cuenta#[\w-]{43}/);
      // El administrador ve el estado en su lista.
      const lista = await request(app).get('/api/v1/usuarios').set(con(admin));
      expect(lista.body.datos.find((u: { id: string }) => u.id === respuesta.body.id)).toMatchObject({ estado: 'pendiente' });
    });

    it('3 · antes de aceptarla no entra con ninguna contraseña, y la respuesta es la de siempre', async () => {
      const { email } = await invitado();

      const intento = await login(email);

      expect(intento.status).toBe(401);
      expect(intento.body.error).toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' });
    });

    it('4 · al aceptarla define su contraseña, el correo queda verificado y puede entrar; la base solo guarda la huella', async () => {
      const { email, id, empresa } = await invitado();
      const token = tokenDelUltimoEnlace(correo, email);

      const respuesta = await activar(token, 'mi-clave-propia-1');

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ email });
      expect(await estadoDe(id)).toEqual({ verificado: true, tiene_clave: true });
      expect(await iniciarSesion(app, email, { clave: 'mi-clave-propia-1' })).toMatch(/^ey/);
      const { rows } = await pool.query("SELECT token_hash FROM recuperaciones_clave WHERE usuario_id = $1 AND proposito = 'invitacion'", [id]);
      expect(rows).toEqual([{ token_hash: createHash('sha256').update(token).digest('hex') }]);
      const asientos = await historialDe(pool, empresa.id);
      expect(asientos.find((fila) => fila.accion === 'CORREO_VERIFICADO' && fila.entidad_id === id))
        .toMatchObject({ usuario_id: id, detalle: { mediante: 'invitacion' } });
      expect(JSON.stringify(asientos)).not.toContain(token);
      expect(JSON.stringify(asientos)).not.toContain('mi-clave-propia-1');
    });

    it('5 · un enlace caducado no sirve: vale 72 horas', async () => {
      const { email, id } = await invitado();
      await pool.query(
        "UPDATE recuperaciones_clave SET creada_en = creada_en - interval '73 hours', expira_en = expira_en - interval '73 hours' WHERE usuario_id = $1",
        [id],
      );

      const respuesta = await activar(tokenDelUltimoEnlace(correo, email));

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.error.codigo).toBe('ENLACE_INVALIDO');
      expect(await estadoDe(id)).toEqual({ verificado: false, tiene_clave: false });
    });

    it('aceptar la invitación pone a cero el bloqueo, como un restablecimiento por correo (RN27)', async () => {
      const { email } = await invitado();
      for (let intento = 0; intento < 5; intento++) await login(email, `adivinada-${intento}`);
      expect((await login(email)).body.error.codigo).toBe('CUENTA_BLOQUEADA');

      await activar(tokenDelUltimoEnlace(correo, email));

      expect(await iniciarSesion(app, email)).toMatch(/^ey/);
    });

    it('6 · un enlace ya usado no sirve otra vez', async () => {
      const { email } = await invitado();
      const token = tokenDelUltimoEnlace(correo, email);

      expect((await activar(token)).status).toBe(200);
      const segunda = await activar(token, 'otra-clave-distinta');

      expect(segunda.status).toBe(400);
      expect(segunda.body.error.codigo).toBe('ENLACE_INVALIDO');
      expect((await login(email, 'otra-clave-distinta')).status).toBe(401);
    });

    it('una contraseña que no cumple deja el enlace vivo para otro intento, también la de más de 72 bytes', async () => {
      const { email } = await invitado();
      const token = tokenDelUltimoEnlace(correo, email);

      expect((await activar(token, 'corta')).body.error.detalles).toEqual([{ campo: 'claveNueva', mensaje: 'Usa al menos 8 caracteres' }]);
      expect((await activar(token, 'ñ'.repeat(40))).body.error.detalles[0].mensaje).toContain('72 bytes');
      expect((await activar(token)).status).toBe(200);
    });

    it('un enlace de invitación no sirve para restablecer otra cuenta ni como enlace de recuperación', async () => {
      const uno = await invitado();
      const tokenDeUno = tokenDelUltimoEnlace(correo, uno.email);

      const comoRecuperacion = await request(app).post('/api/v1/auth/recuperacion/confirmar').send({ token: tokenDeUno, claveNueva: CLAVE });
      const comoVerificacion = await verificar(tokenDeUno);

      expect(comoRecuperacion.body.error.codigo).toBe('ENLACE_INVALIDO');
      expect(comoVerificacion.body.error.codigo).toBe('ENLACE_INVALIDO');
      expect(await estadoDe(uno.id)).toEqual({ verificado: false, tiene_clave: false });
    });
  });

  describe('correos duplicados y temporales', () => {
    it('7 · el mismo correo no crea otra cuenta: en la empresa lo dice; de otra empresa, sin decir cuál', async () => {
      const { admin, email } = await invitado();
      const otra = await registrarEmpresa(app);

      const enLaMisma = await crearUsuario(admin, { email: email.toUpperCase() });
      const desdeOtra = await crearUsuario(otra.token, { email });

      expect(enLaMisma.status).toBe(409);
      expect(enLaMisma.body.error.mensaje).toMatch(/^Esa persona ya tiene una cuenta en tu empresa/);
      expect(desdeOtra.status).toBe(409);
      expect(desdeOtra.body.error.mensaje).toBe('Ese correo ya tiene una cuenta en la plataforma. Usa otro');
      const { rows } = await pool.query('SELECT count(*)::int AS cuentas FROM usuarios WHERE email = $1', [email]);
      expect(rows[0].cuentas).toBe(1);
    });

    it('rechaza dominios de correos temporales conocidos, sin tocar los legítimos', async () => {
      const { token } = await registrarEmpresa(app);

      const temporal = await crearUsuario(token, { email: 'alguien@yopmail.com' });

      expect(temporal.status).toBe(400);
      expect(temporal.body.error.detalles[0]).toMatchObject({ campo: 'email', mensaje: expect.stringMatching(/correos temporales/) });
      expect(['ana@gmail.com', 'ana@outlook.com', 'ana@empresa.com.pe', 'ana@upn.edu.pe'].some(esCorreoDesechable)).toBe(false);
    });
  });

  describe('reenviar la invitación', () => {
    it('8 · se reenvía con freno: una cada 2 minutos y 5 al día, y el administrador sabe cuánto esperar', async () => {
      const { admin, id, email } = await invitado();
      const atrasar = (minutos: number) => pool.query(
        `UPDATE recuperaciones_clave SET creada_en = creada_en - make_interval(mins => $2), expira_en = expira_en - make_interval(mins => $2)
         WHERE usuario_id = $1`, [id, minutos],
      );

      const deInmediato = await reenviar(admin, id);
      expect(deInmediato.status).toBe(429);
      expect(deInmediato.body.error).toMatchObject({ codigo: 'ENVIO_LIMITADO', mensaje: expect.stringMatching(/Espera 2 minuto/) });

      for (let envio = 2; envio <= 5; envio++) {
        await atrasar(3);
        expect((await reenviar(admin, id)).status).toBe(200);
      }
      await atrasar(3);
      const sexto = await reenviar(admin, id);
      expect(sexto.status).toBe(429);
      expect(sexto.body.error.mensaje).toMatch(/5 enlaces .* 24 horas/);
      // Solo vale el último enlace: los anteriores quedaron anulados.
      const { rows } = await pool.query('SELECT count(*)::int AS vigentes FROM recuperaciones_clave WHERE usuario_id = $1 AND usada_en IS NULL', [id]);
      expect(rows[0].vigentes).toBe(1);
      expect((await activar(tokenDelUltimoEnlace(correo, email))).status).toBe(200);
    });

    it('el Master no reenvía a un administrador de una empresa desactivada, y lo dice así', async () => {
      const master = await tokenDelMaster(app);
      const { empresa } = await registrarEmpresa(app);
      const creado = await request(app).post(`/api/v1/plataforma/empresas/${empresa.id}/administradores`).set(con(master))
        .send({ nombre: 'Rosa Díaz', email: nuevoCorreo() });
      await request(app).patch(`/api/v1/plataforma/empresas/${empresa.id}/estado`).set(con(master)).send({ activa: false });
      await pool.query("UPDATE recuperaciones_clave SET creada_en = creada_en - interval '3 minutes' WHERE usuario_id = $1", [creado.body.id]);

      const reenvio = await request(app).post(`/api/v1/plataforma/administradores/${creado.body.id}/invitacion`).set(con(master));

      expect(reenvio.status).toBe(409);
      expect(reenvio.body.error.codigo).toBe('EMPRESA_INACTIVA');
    });

    it('no se reenvía a una cuenta verificada ni, por su id, a la de otra empresa', async () => {
      const { admin, id, email } = await invitado();
      await activar(tokenDelUltimoEnlace(correo, email));
      const otra = await registrarEmpresa(app);

      expect((await reenviar(admin, id)).body.error.codigo).toBe('YA_VERIFICADO');
      expect((await reenviar(otra.token, id)).status).toBe(404);
    });
  });

  describe('recuperación, cuentas desactivadas y sesiones', () => {
    it('9 · «¿Olvidaste tu contraseña?» reenvía la invitación a quien aún no la aceptó, con la respuesta de siempre', async () => {
      const { email, id } = await invitado();
      await pool.query("UPDATE recuperaciones_clave SET creada_en = creada_en - interval '3 minutes' WHERE usuario_id = $1", [id]);
      const anterior = tokenDelUltimoEnlace(correo, email);

      const pedido = await request(app).post('/api/v1/auth/recuperacion').send({ email });
      const desconocido = await request(app).post('/api/v1/auth/recuperacion').send({ email: `nadie.${Date.now()}@ejemplo.pe` });

      expect(pedido.status).toBe(202);
      expect(pedido.body).toEqual(desconocido.body);
      const nuevo = tokenDelUltimoEnlace(correo, email);
      expect(nuevo).not.toBe(anterior);
      expect((await activar(anterior)).body.error.codigo).toBe('ENLACE_INVALIDO');
      expect((await activar(nuevo)).status).toBe(200);
    });

    it('9 · restablecer la contraseña por correo también verifica una cuenta antigua sin verificar', async () => {
      const { admin, email, id } = await invitado();
      // Una cuenta con contraseña puesta por su administrador, pero sin verificar.
      await request(app).patch(`/api/v1/usuarios/${id}`).set(con(admin)).send({ clave: 'puesta-por-el-admin' });
      await pool.query("UPDATE recuperaciones_clave SET creada_en = creada_en - interval '3 minutes' WHERE usuario_id = $1", [id]);

      await request(app).post('/api/v1/auth/recuperacion').send({ email });
      const token = tokenDelUltimoEnlace(correo, email);
      expect(correo.enviados.at(-1)!.asunto).toMatch(/Recupera tu contraseña/);
      expect((await request(app).post('/api/v1/auth/recuperacion/confirmar').send({ token, claveNueva: 'recuperada-1' })).status).toBe(204);

      expect(await estadoDe(id)).toEqual({ verificado: true, tiene_clave: true });
      expect(await iniciarSesion(app, email, { clave: 'recuperada-1' })).toMatch(/^ey/);
    });

    it('3 · con contraseña pero sin verificar no entra: se le manda el enlace y, al confirmarlo, entra', async () => {
      const { admin, email, id, empresa } = await invitado();
      await request(app).patch(`/api/v1/usuarios/${id}`).set(con(admin)).send({ clave: 'puesta-por-el-admin' });
      await pool.query("UPDATE recuperaciones_clave SET creada_en = creada_en - interval '3 minutes' WHERE usuario_id = $1", [id]);

      const intento = await login(email, 'puesta-por-el-admin');

      expect(intento.status).toBe(403);
      expect(intento.body.error).toMatchObject({ codigo: 'CORREO_SIN_VERIFICAR', mensaje: expect.stringMatching(/te enviamos un enlace/) });
      // Una contraseña equivocada no revela que la cuenta está sin verificar.
      expect((await login(email, 'no-es-la-clave')).body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
      const verificacion = correo.enviados.at(-1)!;
      expect(verificacion.asunto).toMatch(/Confirma tu correo/);
      expect(verificacion.texto).toMatch(/\/verificar-correo#/);
      expect((await verificar(tokenDelUltimoEnlace(correo, email))).body).toEqual({ email });
      expect(await iniciarSesion(app, email, { clave: 'puesta-por-el-admin' })).toMatch(/^ey/);
      expect((await historialDe(pool, empresa.id)).find((fila) => fila.accion === 'SESION_FALLIDA' && fila.usuario_id === id))
        .toMatchObject({ detalle: { motivo: 'CORREO_SIN_VERIFICAR' } });
    });

    it('10 · una cuenta desactivada no activa su invitación ni recibe otra', async () => {
      const { admin, email, id } = await invitado();
      await request(app).patch(`/api/v1/usuarios/${id}/estado`).set(con(admin)).send({ activo: false });

      expect((await activar(tokenDelUltimoEnlace(correo, email))).body.error.codigo).toBe('ENLACE_INVALIDO');
      expect((await reenviar(admin, id)).body.error.codigo).toBe('USUARIO_INACTIVO');
      expect(await estadoDe(id)).toEqual({ verificado: false, tiene_clave: false });
    });

    it('si el correo de un administrador cambia, su verificación y sus sesiones caen al instante, y se avisa a los dos correos', async () => {
      const { usuario, token } = await registrarEmpresa(app);
      const master = await tokenDelMaster(app);
      const nuevo = nuevoCorreo();

      const cambio = await request(app).patch(`/api/v1/plataforma/administradores/${usuario.id}`).set(con(master)).send({ email: nuevo });

      expect(cambio.status).toBe(200);
      expect(cambio.body).toMatchObject({ email: nuevo, estado: 'sin_verificar' });
      expect((await request(app).get('/api/v1/auth/yo').set(con(token))).status).toBe(401);
      expect(correo.enviados.findLast((m) => m.para === usuario.email)!.asunto).toMatch(/Tu correo de acceso cambió/);
      expect((await login(nuevo)).body.error.codigo).toBe('CORREO_SIN_VERIFICAR');
      expect((await verificar(tokenDelUltimoEnlace(correo, nuevo))).status).toBe(200);
      expect(await iniciarSesion(app, nuevo)).toMatch(/^ey/);
    });
  });

  it('un enlace enviado al correo anterior no verifica el nuevo, aunque nadie lo haya anulado', async () => {
    const master = await tokenDelMaster(app);
    const { empresa } = await registrarEmpresa(app);
    const anterior = nuevoCorreo();
    const nuevo = nuevoCorreo();
    const creado = await request(app).post(`/api/v1/plataforma/empresas/${empresa.id}/administradores`).set(con(master)).send({ nombre: 'Rosa Díaz', email: anterior });
    const administrador = `/api/v1/plataforma/administradores/${creado.body.id}`;
    const tokenAnterior = tokenDelUltimoEnlace(correo, anterior);
    // Desactivada, el cambio de correo no le manda nada ni anula la invitación que ya tenía.
    await request(app).patch(`${administrador}/estado`).set(con(master)).send({ activo: false });
    await request(app).patch(administrador).set(con(master)).send({ email: nuevo });
    await request(app).patch(`${administrador}/estado`).set(con(master)).send({ activo: true });

    const respuesta = await activar(tokenAnterior);

    expect(respuesta.body.error.codigo).toBe('ENLACE_INVALIDO');
    expect(await estadoDe(creado.body.id)).toEqual({ verificado: false, tiene_clave: false });
    // Y el correo nuevo, que no ha recibido nada, se puede invitar de inmediato: el freno es por buzón.
    expect((await request(app).post(`${administrador}/invitacion`).set(con(master))).status).toBe(200);
    expect((await activar(tokenDelUltimoEnlace(correo, nuevo))).status).toBe(200);
  });

  describe('el Master y los privilegios', () => {
    it('11 · el Master del script de inicialización nace verificado, entra, invita administradores y les reenvía la invitación', async () => {
      const master = await tokenDelMaster(app);
      const { rows } = await pool.query("SELECT email_verificado_en IS NOT NULL AS verificado FROM usuarios WHERE rol = 'master'");
      expect(rows).toEqual([{ verificado: true }]);
      const { empresa } = await registrarEmpresa(app);
      const email = nuevoCorreo();

      const creado = await request(app).post(`/api/v1/plataforma/empresas/${empresa.id}/administradores`).set(con(master)).send({ nombre: 'Rosa Díaz', email });
      await pool.query("UPDATE recuperaciones_clave SET creada_en = creada_en - interval '3 minutes' WHERE usuario_id = $1", [creado.body.id]);
      const reenvio = await request(app).post(`/api/v1/plataforma/administradores/${creado.body.id}/invitacion`).set(con(master));

      expect(creado.body).toMatchObject({ estado: 'pendiente', invitacionEnviada: true });
      expect(reenvio.status).toBe(200);
      await activarCuenta(app, email);
      expect(await iniciarSesion(app, email)).toMatch(/^ey/);
    });

    it('12 · la base no deja que el acceso de una empresa marque un correo como verificado, ni al crear ni al editar', async () => {
      const { usuario, empresa, id } = await invitado();
      const comoAdmin = (sql: string, parametros: unknown[] = []) =>
        accesoDeEmpresa(pool, empresa.id, { usuarioId: usuario.id, rol: 'administrador' }).ejecutar((db) => db.query(sql, parametros));

      await expect(comoAdmin('UPDATE usuarios SET email_verificado_en = now() WHERE id = $1', [id])).rejects.toMatchObject({ code: '42501' });
      await expect(comoAdmin(
        `INSERT INTO usuarios (empresa_id, nombre, email, clave_hash, rol, email_verificado_en) VALUES ($1, 'Falsa', $2, $3, 'usuario', now())`,
        [empresa.id, nuevoCorreo(), await hashearClave(CLAVE)],
      )).rejects.toMatchObject({ code: '42501' });
      await expect(comoAdmin("UPDATE usuarios SET tema = 'oscuro' WHERE id = $1", [usuario.id])).rejects.toMatchObject({ code: '42501' });
      // Lo que su trabajo sí necesita le sigue permitido.
      await comoAdmin("UPDATE usuarios SET nombre = 'Luis Q.' WHERE id = $1", [id]);
      expect(await estadoDe(id)).toEqual({ verificado: false, tiene_clave: false });
    });

    it('12 · la API tampoco: lo que manda el cliente para verificar, cambiar de rol o de empresa se ignora', async () => {
      const { admin, email, id, empresa } = await invitado();
      const otra = await registrarEmpresa(app);

      const edicion = await request(app).patch(`/api/v1/usuarios/${id}`).set(con(admin))
        .send({ nombre: 'Luis Q.', estado: 'verificado', emailVerificadoEn: '2026-01-01', email_verificado_en: '2026-01-01' });
      expect(edicion.body).toMatchObject({ nombre: 'Luis Q.', estado: 'pendiente' });
      expect(await estadoDe(id)).toEqual({ verificado: false, tiene_clave: false });
      const activada = await request(app).post('/api/v1/auth/activacion')
        .send({ token: tokenDelUltimoEnlace(correo, email), claveNueva: CLAVE, rol: 'master', empresaId: otra.empresa.id });

      expect(activada.status).toBe(200);
      const { rows } = await pool.query('SELECT rol, empresa_id FROM usuarios WHERE id = $1', [id]);
      expect(rows).toEqual([{ rol: 'usuario', empresa_id: empresa.id }]);
      // Un usuario común no llega a las rutas de usuarios ni a las de la plataforma.
      const suyo = await iniciarSesion(app, email);
      expect((await reenviar(suyo, id)).status).toBe(403);
      expect((await request(app).post(`/api/v1/plataforma/administradores/${id}/invitacion`).set(con(suyo))).status).toBe(403);
    });

    it('13 · en producción rige igual: una cuenta sin verificar no entra, y no hay variable que lo desactive', async () => {
      // Lo mínimo que exige el entorno de producción, más una variable inventada para «saltarse» la verificación.
      const deProduccion = {
        NODE_ENV: 'production', URL_FRONTEND: 'https://gestion.ejemplo.pe', ALMACENAMIENTO: 'supabase',
        SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_CLAVE_SECRETA: 'clave-secreta-de-pruebas-larga',
        CORREO: 'brevo', BREVO_CLAVE_API: 'clave-de-brevo-de-pruebas-larga', CORREO_REMITENTE: 'avisos@ejemplo.pe',
        OMITIR_VERIFICACION: 'true', VERIFICACION_DE_CORREO: 'false',
      };
      const produccion = crearAppDePruebas(pool, deProduccion, almacenamientoDePruebas(), correo);
      const { admin, id, email } = await invitado();
      await request(app).patch(`/api/v1/usuarios/${id}`).set(con(admin)).send({ clave: 'puesta-por-el-admin' });

      const intento = await request(produccion).post('/api/v1/auth/login').send({ email, clave: 'puesta-por-el-admin' });

      expect(intento.body.error.codigo).toBe('CORREO_SIN_VERIFICAR');
      // El entorno validado descarta lo que no conoce: ninguna variable llega a la aplicación con ese nombre.
      expect(Object.keys(entornoDePruebas(deProduccion)).filter((clave) => /VERIFIC|SALTAR|OMITIR|BYPASS/i.test(clave))).toEqual([]);
    });
  });
});
