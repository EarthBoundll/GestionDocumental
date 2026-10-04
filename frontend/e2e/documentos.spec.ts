import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { archivoPdf, entrar, irDesdeElMenu, nuevaCuenta, nuevaEmpresa, PDF, subirDocumento } from './apoyo';
import { URL_API } from './entorno';

test.describe('Documentos y categorías', () => {
  test('RF06 · El administrador crea, renombra y desactiva categorías; una inactiva no se ofrece al subir', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    await entrar(page, empresa.administrador);
    await page.goto('/admin/categorias');

    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    await page.getByLabel('Nombre').fill('Órdenes de producción');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('La categoría «Órdenes de producción» está lista para usarse.')).toBeVisible();

    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    await page.getByLabel('Nombre').fill('ÓRDENES DE PRODUCCIÓN');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Ya hay una categoría con ese nombre en tu empresa');
    await page.getByRole('button', { name: 'Cancelar' }).click();

    const fila = page.getByRole('listitem').filter({ hasText: 'Recursos humanos' });
    await fila.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Nombre').fill('Personal');
    await page.getByRole('button', { name: 'Guardar' }).click();
    const personal = page.getByRole('listitem').filter({ hasText: 'Personal' });
    await personal.getByRole('button', { name: 'Desactivar' }).click();
    await expect(personal.getByText('Desactivada')).toBeVisible();

    await page.goto('/documentos/nuevo');
    const opciones = page.getByLabel('Categoría').locator('option');
    await expect(opciones.filter({ hasText: 'Órdenes de producción' })).toHaveCount(1);
    await expect(opciones.filter({ hasText: 'Personal' })).toHaveCount(0);
  });

  test('RF07 · Subir un documento con nombre, categoría, fecha y descripción; el servidor rechaza lo que no es lo que dice ser @movil @demo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const usuaria = await nuevaCuenta(request, empresa, 'usuario');
    await entrar(page, usuaria);
    await irDesdeElMenu(page, 'Subir documento');

    await page.getByLabel('Archivo del documento').setInputFiles(archivoPdf('contrato_alquiler-local.pdf'));
    await expect(page.getByLabel('Nombre del documento')).toHaveValue('Contrato alquiler local');
    await page.getByLabel('Nombre del documento').fill('Contrato de alquiler del local');
    await page.getByLabel('Categoría').selectOption({ label: 'Contratos' });
    await page.getByLabel('Fecha del documento').fill('2026-09-15');
    await page.getByLabel(/^Descripción/).fill('Local de Gamarra, dos años');
    await page.getByRole('button', { name: 'Subir documento' }).click();
    await expect(page.getByText('«Contrato de alquiler del local» se subió correctamente.')).toBeVisible();

    await page.getByRole('link', { name: 'Ver documento' }).click();
    await expect(page.getByRole('heading', { name: 'Contrato de alquiler del local' })).toBeVisible();
    await expect(page.getByText('15/09/2026')).toBeVisible();
    await expect(page.getByText('Local de Gamarra, dos años')).toBeVisible();

    // Un ejecutable con extensión .pdf: el servidor mira el contenido, no el nombre.
    await page.goto('/documentos/nuevo');
    await page.getByLabel('Archivo del documento').setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00 programa') });
    await page.getByLabel('Categoría').selectOption({ label: 'Otros' });
    await page.getByRole('button', { name: 'Subir documento' }).click();
    await expect(page.getByRole('alert')).toContainText('Solo se admiten archivos');
  });

  test('RF08 · Quien subió un documento lo edita, y otro usuario no puede editar ni eliminar lo ajeno', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const pedro = await nuevaCuenta(request, empresa, 'usuario', 'Pedro Salas');
    const id = await subirDocumento(request, ana, { nombre: 'Cotización de telas', categoria: 'Cotizaciones' });

    await entrar(page, ana);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Nombre').fill('Cotización de telas para uniformes');
    await page.getByLabel('Categoría').selectOption({ label: 'Contratos' });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Los cambios se guardaron.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cotización de telas para uniformes' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await entrar(page, pedro);
    await page.goto(`/documentos/${id}`);
    await expect(page.getByRole('heading', { name: 'Cotización de telas para uniformes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
  });

  test('RF09 · Eliminar un documento lo saca de las búsquedas, y el administrador puede eliminar lo de otros', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario');
    const id = await subirDocumento(request, ana, { nombre: 'Boleta duplicada' });

    await entrar(page, empresa.administrador);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Eliminar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page).toHaveURL(/\/documentos$/);
    await expect(page.getByText('Aún no hay documentos')).toBeVisible();

    await page.goto(`/documentos/${id}`);
    await expect(page.getByRole('heading', { name: 'Este documento no existe' })).toBeVisible();
  });

  test('RF10 · Buscar por nombre sin importar tildes ni mayúsculas, y filtrar por categoría y fechas @movil @demo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    await subirDocumento(request, empresa.administrador, { nombre: 'Cotización de telas', categoria: 'Cotizaciones', fecha: '2026-07-10' });
    await subirDocumento(request, empresa.administrador, { nombre: 'Factura F001-245', categoria: 'Facturas y boletas', fecha: '2026-08-30' });
    await subirDocumento(request, empresa.administrador, { nombre: 'Boleta de luz', categoria: 'Facturas y boletas', fecha: '2026-09-02' });
    await entrar(page, empresa.administrador);
    const resultados = page.locator('main ul > li a');

    await page.getByLabel('Buscar por nombre').fill('COTIZACION');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(resultados).toHaveText(['Cotización de telas']);

    await page.getByLabel('Buscar por nombre').fill('');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByLabel('Categoría').selectOption({ label: 'Facturas y boletas' });
    await expect(resultados).toHaveText(['Boleta de luz', 'Factura F001-245']);

    await page.getByLabel('Desde').fill('2026-09-01');
    await expect(resultados).toHaveText(['Boleta de luz']);

    await page.getByLabel('Buscar por nombre').fill('contrato');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Ningún documento coincide')).toBeVisible();
    await page.getByRole('button', { name: 'Quitar los filtros' }).click();
    await expect(resultados).toHaveCount(3);
  });

  test('RF11 · Ver un documento en el navegador y descargarlo con su nombre original @movil', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    await subirDocumento(request, empresa.administrador, { nombre: 'Contrato de alquiler', archivo: 'contrato firmado.pdf' });
    await entrar(page, empresa.administrador);

    const [pestana] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Ver Contrato de alquiler' }).click()]);
    await pestana.waitForURL((url) => url.href.startsWith(`${URL_API}/archivos/`));
    await pestana.close();

    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar Contrato de alquiler' }).click()]);
    expect(descarga.suggestedFilename()).toBe('contrato firmado.pdf');
    expect(readFileSync((await descarga.path())!)).toEqual(PDF);
  });

  test('RF12 · El tiempo de respuesta del listado se mide en el servidor y en el navegador', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    await subirDocumento(request, empresa.administrador, { nombre: 'Factura de agosto' });
    const mediciones: string[] = [];
    page.on('response', (respuesta) => {
      if (respuesta.request().method() === 'PATCH' && respuesta.url().includes('/tiempos-respuesta/')) mediciones.push(`${respuesta.url()} → ${respuesta.status()}`);
    });
    await entrar(page, empresa.administrador);

    const listado = page.waitForResponse((r) => r.url().startsWith(`${URL_API}/documentos?`) && r.url().includes('q=agosto'));
    await page.getByLabel('Buscar por nombre').fill('agosto');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const { tiempoRespuestaId } = (await (await listado).json()) as { tiempoRespuestaId: string };

    // El servidor abre la medición y el navegador la completa con lo que la persona esperó hasta ver el resultado.
    await expect.poll(() => mediciones).toContain(`${URL_API}/tiempos-respuesta/${tiempoRespuestaId} → 204`);
    await expect(page.getByRole('link', { name: 'Factura de agosto' })).toBeVisible();
  });
});
