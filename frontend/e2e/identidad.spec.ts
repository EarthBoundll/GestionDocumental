import { expect, test, type Page } from '@playwright/test';
import { entrar, irDesdeElMenu, nuevaCuenta, nuevaEmpresa, PNG, salir } from './apoyo';
import { URL_WEB } from './entorno';

/** La API mira los primeros bytes, no la extensión. */
const LOGO = { name: 'logo.png', mimeType: 'image/png', buffer: PNG };
const VIOLETA = 'rgb(126, 34, 206)';
const VERDE_DE_LA_PLATAFORMA = 'rgb(15, 118, 110)';

/**
 * El color con que se pinta de verdad un botón principal, después de la hoja de estilos y la marca. Se
 * espera a que termine su transición: un botón que se acaba de habilitar todavía se está aclarando.
 */
const colorDelBoton = (page: Page, nombre: string, esperado: string) =>
  expect.poll(() => page.getByRole('button', { name: nombre }).evaluate((boton) => getComputedStyle(boton).backgroundColor)).toBe(esperado);

/** Sin desplazamiento lateral: en 360 px, lo que no cabe se acomoda (indicador 5). */
async function sinDesbordeLateral(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe('Identidad de la empresa y tema de cada persona', () => {
  test('RF31 · El administrador da a su empresa nombre comercial, color y logo, y su gente lo ve @movil @demo', async ({ page, request }, prueba) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const otra = await nuevaEmpresa(request);

    await entrar(page, empresa.administrador);
    await irDesdeElMenu(page, 'Identidad');
    await expect(page.getByRole('heading', { name: 'Identidad', level: 1 })).toBeVisible();
    await page.getByLabel(/^Nombre comercial/).fill('Textiles Ana');
    // Un amarillo con texto blanco encima no se lee: ni se guarda ni se muestra.
    await page.getByRole('textbox', { name: /^Color principal/ }).fill('#fde047');
    await expect(page.getByText(/Con texto blanco encima se lee mal/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await page.getByRole('textbox', { name: /^Color principal/ }).fill('#7e22ce');
    // Antes de guardar, toda la pantalla ya lo muestra.
    await colorDelBoton(page, 'Guardar', VIOLETA);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(/Identidad guardada/)).toBeVisible();

    await page.getByLabel('Archivo del logo').setInputFiles(LOGO);
    await expect(page.getByText('Logo actualizado.')).toBeVisible();
    // El logo llega por un enlace firmado del almacenamiento privado, y la imagen carga de verdad.
    const logo = page.getByRole('img', { name: 'Logo de Textiles Ana' });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((imagen: HTMLImageElement) => imagen.complete && imagen.naturalWidth > 0)).toBe(true);
    await sinDesbordeLateral(page);
    await prueba.attach('identidad-del-administrador', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Queda en el historial de la empresa, con quién lo cambió (indicador 4).
    await irDesdeElMenu(page, 'Historial');
    await expect(page.getByText(/^cambió (color, nombre comercial|nombre comercial, color)$/)).toBeVisible();
    await expect(page.getByText('cambió logo')).toBeVisible();
    await salir(page);

    // Ana lo ve al entrar: su nombre comercial, su logo y su color, sin tocar nada.
    await entrar(page, ana);
    const cabecera = page.getByRole('banner').or(page.getByRole('complementary')).first();
    // En el celular el menú lateral está plegado: cuenta lo que se ve, la barra de arriba.
    await expect(page.getByText('Textiles Ana').filter({ visible: true }).first()).toBeVisible();
    await expect(cabecera.locator('img[src*=".png"]')).toBeVisible();
    await irDesdeElMenu(page, 'Subir documento');
    await colorDelBoton(page, 'Subir documento', VIOLETA);
    await salir(page);

    // Otra empresa sigue con lo suyo: la identidad no se cruza entre empresas.
    await entrar(page, otra.administrador);
    await expect(page.getByText('Textiles Ana')).toHaveCount(0);
    await irDesdeElMenu(page, 'Subir documento');
    await colorDelBoton(page, 'Subir documento', VERDE_DE_LA_PLATAFORMA);
  });

  test('RF32 · Cada persona elige claro u oscuro y la elección la sigue a otro dispositivo @movil', async ({ page, browser, request }, prueba) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    await page.emulateMedia({ colorScheme: 'light' });

    await entrar(page, ana);
    const tema = () => page.evaluate(() => document.documentElement.dataset.tema);
    expect(await tema()).toBe('claro');
    await page.goto('/cuenta');
    await page.locator('label', { hasText: 'Oscuro' }).click();
    expect(await tema()).toBe('oscuro');
    await expect(page.getByRole('radio', { name: 'Oscuro' })).toBeChecked();
    // El fondo de verdad es oscuro, no solo el atributo.
    const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fondo).not.toBe('rgb(248, 250, 252)');
    await sinDesbordeLateral(page);
    await page.goto('/documentos');
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
    await prueba.attach('modo-oscuro', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Otro dispositivo, en modo claro: Ana entra y la recibe el oscuro que eligió.
    const otroDispositivo = await browser.newContext({ baseURL: URL_WEB, colorScheme: 'light', locale: 'es-PE', timezoneId: 'America/Lima' });
    const celular = await otroDispositivo.newPage();
    await entrar(celular, ana);
    expect(await celular.evaluate(() => document.documentElement.dataset.tema)).toBe('oscuro');

    // «Del dispositivo» sigue al dispositivo, también si cambia con la sesión abierta.
    await celular.goto('/cuenta');
    await celular.locator('label', { hasText: 'Del dispositivo' }).click();
    expect(await celular.evaluate(() => document.documentElement.dataset.tema)).toBe('claro');
    await celular.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => celular.evaluate(() => document.documentElement.dataset.tema)).toBe('oscuro');
    await otroDispositivo.close();
  });
});
