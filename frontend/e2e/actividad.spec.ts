import { expect, test } from '@playwright/test';
import { entrar, nuevaCuenta, nuevaEmpresa, subirDocumento, tokenDe } from './apoyo';
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
