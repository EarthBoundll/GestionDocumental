import { expect, test } from '@playwright/test';
import { entrar, irDesdeElMenu, nuevaCuenta, nuevaEmpresa, subirDocumento } from './apoyo';

test.describe('Tablero del administrador', () => {
  test('RF28 · El tablero muestra el estado de la empresa y lo que registra cada indicador de la tesis @demo @movil', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const usuaria = await nuevaCuenta(request, empresa, 'usuario');
    await subirDocumento(request, usuaria, { nombre: 'Factura F001-120' });

    await entrar(page, empresa.administrador);
    await irDesdeElMenu(page, 'Tablero');

    await expect(page.getByRole('heading', { name: 'Tablero' })).toBeVisible();
    const contenido = page.getByRole('main');
    await expect(contenido.getByText('Documentos', { exact: true })).toBeVisible();
    await expect(contenido.getByText('Usuarios activos', { exact: true })).toBeVisible();
    await expect(contenido.getByText('2 de 2', { exact: true })).toBeVisible();
    for (let indicador = 1; indicador <= 7; indicador++) {
      await expect(page.getByText(new RegExp(`^Indicador ${indicador} · `))).toBeVisible();
    }
    await expect(page.getByText('1 documento subido')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Acciones registradas por día' })).toBeVisible();
    // El flujo de aprobación del periodo y lo último que pasó, con enlace al historial completo.
    await expect(page.getByRole('heading', { name: 'Flujo de aprobación' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Actividad reciente' }).getByRole('listitem').filter({ hasText: 'Documento subido' }))
      .toContainText('Factura F001-120');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
