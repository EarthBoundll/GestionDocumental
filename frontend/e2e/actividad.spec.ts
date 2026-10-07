import { expect, test } from '@playwright/test';
import { entrar, nuevaCuenta, nuevaEmpresa, PNG, subirDocumento, tokenDe } from './apoyo';
import { URL_API } from './entorno';

test.describe('Actividad de un documento', () => {
  test('RF30 · La ficha cuenta la vida del documento; el administrador ve además quién lo vio @movil @demo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const id = await subirDocumento(request, ana, { nombre: 'Contrato de alquiler', categoria: 'Contratos' });
    // Ana abre el archivo antes: queda en el historial, pero a ella la ficha no se lo muestra.
    const tokenDeAna = await tokenDe(request, ana.email, ana.clave);
    expect((await request.get(`${URL_API}/documentos/${id}/archivo?modo=ver`, { headers: { Authorization: `Bearer ${tokenDeAna}` } })).ok()).toBe(true);

    await entrar(page, ana);
    await page.goto(`/documentos/${id}`);
    const actividad = page.getByRole('list', { name: 'Actividad del documento' });
    await expect(actividad.getByRole('listitem')).toHaveCount(1);
    await expect(actividad).toContainText('Ana Torres subió el documento');
    await page.getByRole('button', { name: 'Solicitar aprobación' }).click();
    await page.getByLabel(/^Comentario para quien lo revise/).fill('Listo para revisar');
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    // El paso nuevo aparece sin recargar: la línea de tiempo se vuelve a pedir tras cada acción.
    await expect(actividad.getByRole('listitem').first()).toContainText('Ana Torres pidió aprobarlo');
    await expect(actividad.getByRole('listitem').first()).toContainText('«Listo para revisar»');
    await expect(actividad).not.toContainText('lo vio');
    // La ruta lleva al listado de su categoría.
    await page.getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Contratos' }).click();
    await expect(page).toHaveURL(/categoriaId=/);
    await expect(page.getByRole('link', { name: 'Contrato de alquiler' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await entrar(page, empresa.administrador);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await page.getByLabel(/^Comentario/).fill('Conforme');
    await page.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText('Aprobaste el documento.')).toBeVisible();
    const pasos = actividad.getByRole('listitem');
    await expect(pasos.first()).toContainText(`${empresa.administrador.nombre} lo aprobó`);
    await expect(pasos.first()).toContainText('«Conforme»');
    await expect(actividad).toContainText('Ana Torres lo vio');
    await expect(pasos).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

test.describe('Vista previa del archivo', () => {
  test('RF33 · La imagen o el PDF se ven dentro de la ficha, y verlos queda en su actividad @movil', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const plano = await subirDocumento(request, ana, { nombre: 'Plano del local', archivo: 'plano.png', contenido: { mimeType: 'image/png', buffer: PNG } });
    const contrato = await subirDocumento(request, ana, { nombre: 'Contrato de alquiler', categoria: 'Contratos' });

    await entrar(page, ana);
    await page.goto(`/documentos/${plano}`);
    await page.getByRole('button', { name: 'Vista previa' }).click();
    const imagen = page.getByRole('img', { name: 'Plano del local' });
    await expect(imagen).toBeVisible();
    // Carga de verdad por el enlace firmado, no una imagen rota.
    expect(await imagen.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: 'Cerrar la vista previa' }).click();
    await expect(imagen).toHaveCount(0);

    // El PDF depende del navegador: con visor propio se incrusta; sin él (Chrome en Android) queda «Ver».
    await page.goto(`/documentos/${contrato}`);
    await expect(page.getByRole('button', { name: 'Ver' })).toBeVisible();
    if (await page.evaluate(() => navigator.pdfViewerEnabled)) {
      await page.getByRole('button', { name: 'Vista previa' }).click();
      await expect(page.getByTitle('Vista previa de Contrato de alquiler')).toHaveAttribute('src', /\/documentos\/|supabase|archivos/);
    } else {
      await expect(page.getByRole('button', { name: 'Vista previa' })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    // Para el administrador, verla cuenta como verlo (indicador 3); abrir la ficha, no.
    await entrar(page, empresa.administrador);
    await page.goto(`/documentos/${plano}`);
    await expect(page.getByRole('list', { name: 'Actividad del documento' })).toContainText('Ana Torres lo vio');
  });
});
