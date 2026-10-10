import { expect, test } from '@playwright/test';
import { CLAVE, enlaceDelCorreo, entrar, irDesdeElMenu, nuevaCuenta, nuevaEmpresa, salir, tokenDe, ultimoCorreoPara, unico } from './apoyo';
import { URL_API, URL_WEB } from './entorno';

test.describe('Acceso: iniciar y cerrar sesión, contraseñas', () => {
  test('RF02 · Iniciar sesión con correo y contraseña; si fallan, el mismo mensaje exista o no la cuenta @movil @demo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const usuaria = await nuevaCuenta(request, empresa, 'usuario');

    for (const [email, clave] of [[usuaria.email, 'no-es-la-clave'], [`nadie.${usuaria.email}`, 'no-es-la-clave']] as const) {
      await page.goto('/login');
      await page.getByLabel('Correo').fill(email);
      await page.getByLabel('Contraseña', { exact: true }).fill(clave);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos');
    }

    await entrar(page, usuaria);
    await expect(page).toHaveURL(/\/documentos$/);
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
  });

  test('D40 · El acceso se mueve sin pesar: se detiene con «reducir movimiento» y la contraseña se puede ver @movil', async ({ page, browser }, prueba) => {
    const animacion = (selector: string) => page.getByTestId(selector).locator(':scope > *').first().evaluate((elemento) => getComputedStyle(elemento).animationName);
    if (prueba.project.name === 'escritorio') await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');

    // Con movimiento: la palabra del titular rota y los halos se desplazan.
    expect(await animacion('palabras-que-rotan')).toBe('palabras');
    expect(await animacion('aurora')).toBe('aurora');
    // Las tarjetas de muestra solo caben en una pantalla ancha y alta; en el celular, ni se muestran.
    await expect(page.getByTestId('tarjetas-de-muestra')).toBeVisible({ visible: prueba.project.name === 'escritorio' });

    // El ojo muestra lo escrito y lo vuelve a ocultar.
    const clave = page.getByLabel('Contraseña', { exact: true });
    await clave.fill('una-clave-larga');
    await page.getByRole('button', { name: 'Mostrar la contraseña' }).click();
    await expect(clave).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Mostrar la contraseña' }).click();
    await expect(clave).toHaveAttribute('type', 'password');
    // Con las animaciones terminadas: lo que se ve cuando todo llegó a su sitio.
    await prueba.attach('acceso-con-movimiento', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });

    // Con «reducir movimiento» en el dispositivo nada se mueve, y todo está en su sitio desde el primer momento.
    const quieto = await browser.newContext({ baseURL: URL_WEB, locale: 'es-PE', reducedMotion: 'reduce' });
    const pagina = await quieto.newPage();
    await pagina.goto('/login');
    for (const adorno of ['palabras-que-rotan', 'aurora']) {
      expect(await pagina.getByTestId(adorno).locator(':scope > *').first().evaluate((elemento) => getComputedStyle(elemento).animationName)).toBe('none');
    }
    expect(await pagina.getByLabel('Correo').evaluate((campo) => getComputedStyle(campo.closest('form > *')!).opacity)).toBe('1');
    await quieto.close();
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

  test('RNF10 · Desde el inicio de sesión, sin cuenta: pedir una cuenta por correo y leer los términos y la privacidad @movil', async ({ page }) => {
    await page.goto('/login');

    // No hay registro público: una empresa pide su cuenta con un correo ya redactado (D38).
    const solicitar = new URL((await page.getByRole('link', { name: 'Solicita una cuenta' }).getAttribute('href'))!);
    expect(solicitar.protocol).toBe('mailto:');
    expect(solicitar.searchParams.get('subject')).toBe('Solicitud de cuenta para mi empresa');

    const legal = page.getByRole('navigation', { name: 'Información legal' });
    await legal.getByRole('link', { name: 'Privacidad' }).click();
    await expect(page.getByRole('heading', { name: 'Política de privacidad', level: 1 })).toBeVisible();
    await expect(page.getByText('El sistema no guarda tu dirección IP.', { exact: false })).toBeVisible();
    await page.getByRole('navigation', { name: 'Información legal' }).getByRole('link', { name: 'Términos de uso' }).click();
    await expect(page.getByRole('heading', { name: 'Términos de uso', level: 1 })).toBeVisible();

    await page.getByRole('link', { name: 'Volver' }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
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
    await expect(page.getByRole('alert')).toHaveText('El enlace no es válido, ya se usó o caducó. Pide uno nuevo con «¿Olvidaste tu contraseña?»');

    await entrar(page, { email: usuaria.email, clave: 'recuperada-clave-3' });
  });

  test('RF37 · Una cuenta invitada no entra hasta abrir su invitación; la abre en el celular, elige su contraseña y entra @movil', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const correo = `invitada.${unico()}@e2e.pe`;
    const token = await tokenDe(request, empresa.administrador.email, empresa.administrador.clave);
    const creada = await request.post(`${URL_API}/usuarios`, {
      headers: { Authorization: `Bearer ${token}` }, data: { nombre: 'Invitada de prueba', email: correo, rol: 'usuario' },
    });
    expect(creada.status()).toBe(201);

    // Sin abrir la invitación no entra con ninguna contraseña, y la respuesta es la de siempre: no revela nada.
    await page.goto('/login');
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill(CLAVE);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos');

    const enlace = enlaceDelCorreo(correo, '/activar-cuenta');
    await page.goto(enlace);
    await expect(page).toHaveURL(/\/activar-cuenta$/); // el token sale de la barra de direcciones
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('elegida-por-ella-1');
    await page.getByLabel('Repite la contraseña nueva').fill('elegida-por-ella-1');
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page.getByText('Tu cuenta está activa y tu correo quedó confirmado.')).toBeVisible();
    await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByLabel('Correo')).toHaveValue(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill('elegida-por-ella-1');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/documentos$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // La invitación sirve una sola vez.
    await salir(page);
    await page.goto(enlace);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('otra-clave-ajena-2');
    await page.getByLabel('Repite la contraseña nueva').fill('otra-clave-ajena-2');
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page.getByRole('alert')).toContainText('El enlace no es válido, ya se usó o caducó');
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
