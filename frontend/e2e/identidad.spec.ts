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
  expect.poll(() => page.getByRole('button', { name: nombre, exact: true }).evaluate((boton) => getComputedStyle(boton).backgroundColor)).toBe(esperado);

/**
 * El contraste WCAG entre el fondo de la página y un texto secundario (slate-500, el más claro que se usa), tal
 * como los pinta el navegador: cada color se dibuja en un píxel y se lee de vuelta, así cuenta también oklch().
 */
const contrasteDelTextoSecundario = (page: Page) => page.evaluate(() => {
  const muestra = document.createElement('p');
  muestra.className = 'text-slate-500';
  document.body.append(muestra);
  const texto = getComputedStyle(muestra).color;
  muestra.remove();
  const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const luminancia = (color: string) => {
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = color;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b] = [...pixel.getImageData(0, 0, 1, 1).data].map((valor) => {
      const s = valor / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [clara, oscura] = [luminancia(getComputedStyle(document.body).backgroundColor), luminancia(texto)].sort((x, y) => y - x);
  return (clara! + 0.05) / (oscura! + 0.05);
});

/** Una foto apaisada como la de una cámara, de 1600 × 1000 px: la dibuja el propio navegador. */
const fotoApaisada = async (page: Page) => Buffer.from(await page.evaluate(async () => {
  const lienzo = Object.assign(document.createElement('canvas'), { width: 1600, height: 1000 });
  const dibujo = lienzo.getContext('2d')!;
  const degradado = dibujo.createLinearGradient(0, 0, 1600, 1000);
  degradado.addColorStop(0, '#0c4a6e');
  degradado.addColorStop(1, '#f59e0b');
  dibujo.fillStyle = degradado;
  dibujo.fillRect(0, 0, 1600, 1000);
  const png = await new Promise<Blob>((listo) => lienzo.toBlob((blob) => listo(blob!), 'image/png'));
  return [...new Uint8Array(await png.arrayBuffer())];
}));

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
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
    await page.getByRole('textbox', { name: /^Color principal/ }).fill('#7e22ce');
    // Antes de guardar, toda la pantalla ya lo muestra.
    await colorDelBoton(page, 'Guardar', VIOLETA);
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
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

  test('RF31 · El fondo de la empresa: su tono en claro y en oscuro, y una imagen detrás solo en la computadora @movil', async ({ page, request }, prueba) => {
    const enCelular = prueba.project.name === 'celular';
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const otra = await nuevaEmpresa(request);
    await page.emulateMedia({ colorScheme: 'light' });
    const fondoDeLaPagina = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await entrar(page, empresa.administrador);
    await irDesdeElMenu(page, 'Identidad');
    const neutro = await fondoDeLaPagina();
    // Un color chillón a propósito: de él solo se toma el tono, así que el texto se sigue leyendo (AA, 4,5:1).
    await page.getByRole('textbox', { name: /^Otro color de fondo/ }).fill('#d946ef');
    await expect.poll(fondoDeLaPagina).not.toBe(neutro);
    expect(await contrasteDelTextoSecundario(page)).toBeGreaterThanOrEqual(4.5);
    // El mismo color en el modo oscuro: otro tono de fondo, igual de legible.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tema)).toBe('oscuro');
    expect(await contrasteDelTextoSecundario(page)).toBeGreaterThanOrEqual(4.5);
    await page.emulateMedia({ colorScheme: 'light' });

    await page.getByRole('button', { name: 'Cielo', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar el fondo' }).click();
    await expect(page.getByText(/Fondo guardado/)).toBeVisible();
    await page.getByLabel('Archivo del fondo').setInputFiles({ name: 'taller.png', mimeType: 'image/png', buffer: await fotoApaisada(page) });
    await expect(page.getByText('Imagen de fondo actualizada.')).toBeVisible();
    await sinDesbordeLateral(page);
    // La tarjeta sola: en una captura de página entera, Chromium repite lo que es fijo (la imagen, el menú).
    const tarjetaDelFondo = page.locator('section', { has: page.getByRole('heading', { name: 'Fondo', exact: true }) });
    await prueba.attach('fondo-en-identidad', { body: await tarjetaDelFondo.screenshot({ animations: 'disabled' }), contentType: 'image/png' });

    // En el historial, con quién lo cambió (indicador 4).
    await irDesdeElMenu(page, 'Historial');
    await expect(page.getByText('cambió color de fondo')).toBeVisible();
    await expect(page.getByText('cambió imagen de fondo')).toBeVisible();
    await salir(page);

    // Ana lo ve al entrar. La imagen subió ya comprimida en el navegador (WebP) y solo se pide en la computadora.
    const imagenesDeFondo: string[] = [];
    page.on('request', (peticion) => {
      if (/\/archivos\/[^?]+\.(webp|jpg)\?/.test(peticion.url())) imagenesDeFondo.push(peticion.url());
    });
    await entrar(page, ana);
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--fondo'))).toBe('#5b8fd6');
    const capa = page.getByTestId('imagen-de-fondo');
    if (enCelular) {
      // Indicador 5: en el celular la regla que pide la imagen no se cumple, y el navegador no la descarga.
      expect(await capa.evaluate((elemento) => getComputedStyle(elemento).backgroundImage)).toBe('none');
      await page.waitForLoadState('networkidle');
      expect(imagenesDeFondo).toEqual([]);
    } else {
      await expect.poll(() => capa.evaluate((elemento) => getComputedStyle(elemento).backgroundImage)).toMatch(/url\(".+\.webp\?/);
      await expect.poll(() => imagenesDeFondo.length).toBeGreaterThan(0);
      // El texto no queda sobre la foto: el contenido va en un panel opaco del color de la página.
      expect(await page.getByRole('main').evaluate((main) => getComputedStyle(main).backgroundColor)).toBe(await fondoDeLaPagina());
      await prueba.attach('fondo-modo-claro', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.tema)).toBe('oscuro');
      // Sin transiciones a medias: los colores del menú ya en su tono oscuro.
      await prueba.attach('fondo-modo-oscuro', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
    }
    await salir(page);

    // Otra empresa sigue con lo suyo: ni su color ni su imagen.
    await entrar(page, otra.administrador);
    await expect(page.getByRole('heading', { name: 'Documentos', level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--fondo'))).toBe('');
    await expect(page.getByTestId('imagen-de-fondo')).toHaveCount(0);
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
