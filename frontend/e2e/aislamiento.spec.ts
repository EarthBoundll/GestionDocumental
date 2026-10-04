import { expect, test } from '@playwright/test';
import { entrar, nuevaCuenta, nuevaEmpresa, subirDocumento } from './apoyo';

// La batería completa, endpoint por endpoint, está en backend/tests/integracion/aislamiento.test.ts. Aquí se
// comprueba lo mismo como lo intentaría una persona: con la interfaz y un enlace copiado.
test.describe('Aislamiento entre empresas (indicador 6)', () => {
  test('RF10, RF11 · Una empresa no encuentra, no abre y no descarga los documentos de otra, ni con el enlace @movil @demo', async ({ page, request }) => {
    const textiles = await nuevaEmpresa(request, 'Textiles Andinos');
    const contable = await nuevaEmpresa(request, 'Estudio Contable Lima');
    const ana = await nuevaCuenta(request, textiles, 'usuario');
    const id = await subirDocumento(request, ana, { nombre: 'Planilla confidencial de Textiles' });

    await entrar(page, contable.administrador);
    await expect(page.getByText('Aún no hay documentos')).toBeVisible();
    await page.getByLabel('Buscar por nombre').fill('planilla');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Ningún documento coincide')).toBeVisible();

    await page.goto(`/documentos/${id}`);
    await expect(page.getByRole('heading', { name: 'Este documento no existe' })).toBeVisible();
    await expect(page.getByText('Planilla confidencial de Textiles')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Descargar' })).toHaveCount(0);
  });
});
