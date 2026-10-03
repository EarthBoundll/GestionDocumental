import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, conectarSesion, ErrorApi, urlDe } from './cliente';

function responder(estado: number, cuerpo?: unknown) {
  const fetchSimulado = vi.fn(async () => new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado }));
  vi.stubGlobal('fetch', fetchSimulado);
  return fetchSimulado;
}

describe('cliente de la API', () => {
  const alCaducar = vi.fn();
  afterEach(() => {
    alCaducar.mockReset();
    conectarSesion({ token: () => null, alCaducar: () => {} });
  });

  it('envía el token de la sesión y el cuerpo en JSON', async () => {
    conectarSesion({ token: () => 'abc', alCaducar });
    const fetchSimulado = responder(201, { id: '1' });

    expect(await api('/categorias', { metodo: 'POST', cuerpo: { nombre: 'Contratos' } })).toEqual({ id: '1' });
    expect(fetchSimulado).toHaveBeenCalledWith('http://localhost:4000/api/v1/categorias', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
      body: '{"nombre":"Contratos"}',
    }));
  });

  it('nunca envía la empresa: no hay forma de pasarla salvo en la consulta, y ningún recurso lo hace', () => {
    // La empresa sale del token en la API (RN01); el cliente no tiene ningún parámetro para ella.
    expect(urlDe('/documentos', { q: 'contrato', categoriaId: '', desde: undefined, hasta: null, pagina: 2 }))
      .toBe('http://localhost:4000/api/v1/documentos?q=contrato&pagina=2');
  });

  it('traduce el error común de la API, con los mensajes por campo', async () => {
    conectarSesion({ token: () => 'abc', alCaducar });
    responder(400, { error: { codigo: 'VALIDACION', mensaje: 'Revisa los datos', detalles: [{ campo: 'nombre', mensaje: 'Escribe al menos 2 caracteres' }] } });

    const error = await api('/categorias', { metodo: 'POST', cuerpo: {} }).catch((causa: unknown) => causa);

    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({ estado: 400, codigo: 'VALIDACION', mensaje: 'Revisa los datos' });
    expect((error as ErrorApi).porCampo()).toEqual({ nombre: 'Escribe al menos 2 caracteres' });
    expect(alCaducar).not.toHaveBeenCalled();
  });

  it('un 401 con sesión significa que la sesión ya no vale', async () => {
    conectarSesion({ token: () => 'revocado', alCaducar });
    responder(401, { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Inicia sesión' } });

    await expect(api('/documentos')).rejects.toMatchObject({ estado: 401 });
    expect(alCaducar).toHaveBeenCalledOnce();
  });

  it('un 401 sin sesión (credenciales erróneas al entrar) no cierra nada', async () => {
    conectarSesion({ token: () => null, alCaducar });
    responder(401, { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Correo o contraseña incorrectos' } });

    await expect(api('/auth/login', { metodo: 'POST', cuerpo: {} })).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(alCaducar).not.toHaveBeenCalled();
  });

  it('sin conexión, un mensaje que la persona entiende', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    await expect(api('/documentos')).rejects.toMatchObject({ estado: 0, codigo: 'SIN_CONEXION', mensaje: expect.stringMatching(/No se pudo conectar/) });
  });

  it('un 204 no tiene cuerpo que leer', async () => {
    responder(204);
    await expect(api('/auth/logout', { metodo: 'POST' })).resolves.toBeUndefined();
  });
});
