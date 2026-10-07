import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { entrar, nuevaCuenta, nuevaEmpresa, PDF, subirDocumento } from './apoyo';

/** Otro PDF válido, distinto del primero: así se comprueba que cada versión guarda su propio archivo. */
const PDF_CORREGIDO = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Version 2 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

test.describe('Versiones de un documento', () => {
  test('RF34 · Una versión nueva no pisa la anterior, y restaurar una crea otra sin borrar nada @movil @demo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const id = await subirDocumento(request, ana, { nombre: 'Contrato de alquiler', categoria: 'Contratos', archivo: 'contrato-v1.pdf' });

    await entrar(page, ana);
    await page.goto(`/documentos/${id}`);
    const versiones = page.getByRole('list', { name: 'Versiones del documento' });
    await expect(versiones.getByRole('listitem')).toHaveCount(1);

    await page.getByRole('button', { name: 'Subir versión nueva' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Archivo').setInputFiles({ name: 'contrato-v2.pdf', mimeType: 'application/pdf', buffer: PDF_CORREGIDO });
    await dialogo.getByLabel(/^Qué cambió/).fill('Corrige el monto de la cláusula 4');
    await dialogo.getByRole('button', { name: 'Subir versión 2' }).click();
    await expect(page.getByText(/Se subió la versión 2/)).toBeVisible();
    await expect(versiones.getByRole('listitem').first()).toContainText('Versión 2');
    await expect(versiones.getByRole('listitem').first()).toContainText('«Corrige el monto de la cláusula 4»');

    // La versión 1 sigue ahí, con su archivo de entonces.
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar la versión 1' }).click()]);
    expect(descarga.suggestedFilename()).toBe('contrato-v1.pdf');
    expect(readFileSync((await descarga.path())!)).toEqual(PDF);

    // Restaurar no retrocede: la versión 1 vuelve como versión 3, y las tres quedan.
    await page.getByRole('button', { name: 'Restaurar la versión 1' }).click();
    await expect(page.getByText(/La versión 1 se restauró como versión 3/)).toBeVisible();
    await expect(versiones.getByRole('listitem')).toHaveCount(3);
    await expect(versiones.getByRole('listitem').first()).toContainText('Copia de la versión 1');

    // Y todo queda en la actividad del documento (indicador 4).
    const actividad = page.getByRole('list', { name: 'Actividad del documento' });
    await expect(actividad).toContainText('Ana Torres restauró la versión 1 como versión 3');
    await expect(actividad).toContainText('Ana Torres subió la versión 2');
  });
});
