import { expect, test } from '@playwright/test';
import { CLAVE, entrar, irDesdeElMenu, nuevaCuenta, nuevaEmpresa, salir, ultimoCorreoPara } from './apoyo';
import { URL_API } from './entorno';

test.describe('Acceso: iniciar y cerrar sesión, contraseñas', () => {
  test('RF02 · Iniciar sesión con correo y contraseña; si fallan, el mismo mensaje exista o no la cuenta @movil @demo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const usuaria = await nuevaCuenta(request, empresa, 'usuario');

    for (const [email, clave] of [[usuaria.email, 'no-es-la-clave'], [`nadie.${usuaria.email}`, 'no-es-la-clave']] as const) {
      await page.goto('/login');
      await page.getByLabel('Correo').fill(email);
      await page.getByLabel('Contraseña').fill(clave);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos');
    }

    await entrar(page, usuaria);
    await expect(page).toHaveURL(/\/documentos$/);
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
  });

  test('RF03 · Cerrar sesión pide confirmación y la revoca en el servidor: el token anterior ya no sirve @movil', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    await entrar(page, empresa.administrador);
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('gestion-documental.sesion') ?? '{}').token as string);
    expect((await request.get(`${URL_API}/auth/yo`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);

    // Un toque de más (en el celular el botón está junto a la campana) no cierra nada.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.getByRole('dialog', { name: '¿Cerrar sesión?' }).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
    expect((await request.get(`${URL_API}/auth/yo`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.getByRole('dialog', { name: '¿Cerrar sesión?' }).getByRole('button', { name: 'Sí, cerrar sesión' }).click();
    await expect(page.getByText('Cerrando sesión…')).toBeVisible();
    await expect(page).toHaveURL(/\/login\?motivo=salida$/);
    await expect(page.getByText('Cerraste tu sesión. Hasta pronto.')).toBeVisible();
    expect((await request.get(`${URL_API}/auth/yo`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);

    await page.goto('/documentos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('RF04 · Cambiar la propia contraseña: hace falta la actual, y la nueva sirve para entrar', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const usuaria = await nuevaCuenta(request, empresa, 'usuario');
    await entrar(page, usuaria);
    await page.goto('/cuenta');

    await page.getByLabel('Contraseña actual').fill('no-es-la-actual');
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('otra-clave-segura-2');
    await page.getByLabel('Repite la contraseña nueva').fill('otra-clave-segura-2');
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page.getByText('No coincide con tu contraseña actual')).toBeVisible();

    await page.getByLabel('Contraseña actual').fill(CLAVE);
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page.getByText('Tu contraseña se cambió.')).toBeVisible();

    await salir(page);
    await entrar(page, { email: usuaria.email, clave: 'otra-clave-segura-2' });
  });

  test('RF21 · Recuperar la contraseña con un enlace de un solo uso que llega por correo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const usuaria = await nuevaCuenta(request, empresa, 'usuario');

    await page.goto('/login');
    await page.getByLabel('Correo').fill(usuaria.email);
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
    await expect(page.getByLabel('Correo de tu cuenta')).toHaveValue(usuaria.email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    const mensaje = await page.getByRole('status').textContent();
    expect(mensaje).toMatch(/Si el correo corresponde a una cuenta/);

    // La respuesta es la misma para un correo que no existe: no revela qué cuentas hay.
    await page.goto('/recuperar-clave');
    await page.getByLabel('Correo de tu cuenta').fill(`nadie.${usuaria.email}`);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('status')).toHaveText(mensaje!);

    const enlace = /https?:\/\/\S+\/restablecer-clave#\S+/.exec(ultimoCorreoPara(usuaria.email))![0];
    await page.goto(enlace);
    await expect(page).toHaveURL(/\/restablecer-clave$/); // el token sale de la barra de direcciones
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('recuperada-clave-3');
    await page.getByLabel('Repite la contraseña nueva').fill('recuperada-clave-3');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('Tu contraseña se cambió')).toBeVisible();

    await page.goto('about:blank');
    await page.goto(enlace);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('otra-vez-clave-4');
    await page.getByLabel('Repite la contraseña nueva').fill('otra-vez-clave-4');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('alert')).toHaveText('El enlace no es válido o ya caducó. Pide uno nuevo');

    await entrar(page, { email: usuaria.email, clave: 'recuperada-clave-3' });
  });

  test('RF02 · Tras entrar, el menú lleva a cada pantalla sin que nada se salga del ancho de la pantalla @movil', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    await entrar(page, empresa.administrador);
    await irDesdeElMenu(page, 'Categorías');
    await expect(page.getByRole('heading', { name: 'Categorías', level: 1 })).toBeVisible();
    await irDesdeElMenu(page, 'Buscar documentos');
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
    // Nada se sale de la pantalla a lo ancho.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
