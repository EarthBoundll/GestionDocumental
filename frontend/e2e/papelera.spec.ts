import { expect, test } from '@playwright/test';
import { eliminarDocumento, entrar, irDesdeElMenu, nuevaCuenta, nuevaEmpresa, subirDocumento } from './apoyo';

test.describe('Papelera', () => {
  test('RF09, RF26 · Lo eliminado va a la papelera; el administrador lo restaura o lo elimina para siempre @demo', async ({ page, request, browser }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Quispe');
    const id = await subirDocumento(request, ana, { nombre: 'Contrato de alquiler 2026' });

    await entrar(page, ana);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByRole('dialog')).toContainText('pasará a la papelera');
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Aún no hay documentos')).toBeVisible();

    const admin = await (await browser.newContext()).newPage();
    await entrar(admin, empresa.administrador);
    await irDesdeElMenu(admin, 'Papelera');
    const fila = admin.getByRole('listitem').filter({ hasText: 'Contrato de alquiler 2026' });
    await expect(fila).toContainText('eliminado por Ana Quispe');
    await expect(fila).toContainText('Se borrará en 30 días');
    await fila.getByRole('button', { name: 'Restaurar' }).click();
    await expect(admin.getByText('«Contrato de alquiler 2026» vuelve a estar entre los documentos, tal como estaba.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Contrato de alquiler 2026' })).toBeVisible();

    await eliminarDocumento(request, ana, id);
    await admin.reload();
    await fila.getByRole('button', { name: 'Eliminar para siempre' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Eliminar para siempre' }).click();
    await expect(admin.getByText('«Contrato de alquiler 2026» se eliminó para siempre.')).toBeVisible();
    await expect(admin.getByText('La papelera está vacía')).toBeVisible();

    // La usuaria no administra la papelera.
    await page.goto('/admin/papelera');
    await expect(page.getByText('No tienes permiso para ver esto')).toBeVisible();
  });
});
