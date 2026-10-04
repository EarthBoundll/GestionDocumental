import { expect, test } from '@playwright/test';
import { entrar, nuevaCategoria, nuevaCuenta, nuevaEmpresa, subirDocumento } from './apoyo';
import { MASTER } from './entorno';

test.describe('Control de acceso por roles', () => {
  test('RF25 · Una categoría restringida y sus documentos solo los ven los administradores y las personas autorizadas @demo', async ({ page, request, browser }) => {
    const empresa = await nuevaEmpresa(request);
    const autorizada = await nuevaCuenta(request, empresa, 'usuario', 'Rosa Autorizada');
    const ajena = await nuevaCuenta(request, empresa, 'usuario', 'Iván Sin Acceso');

    await entrar(page, empresa.administrador);
    await page.goto('/admin/categorias');
    await page.getByRole('button', { name: 'Nueva categoría' }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nombre').fill('Planillas');
    await dialogo.getByRole('checkbox', { name: /Restringir a personas concretas/ }).check();
    await dialogo.getByRole('checkbox', { name: /Rosa Autorizada/ }).check();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('La categoría «Planillas» está lista para usarse.')).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Planillas' })).toContainText('Restringida · 1 persona');
    const id = await subirDocumento(request, empresa.administrador, { nombre: 'Planilla de septiembre', categoria: 'Planillas' });

    const deRosa = await (await browser.newContext()).newPage();
    await entrar(deRosa, autorizada);
    await expect(deRosa.getByRole('link', { name: 'Planilla de septiembre' })).toBeVisible();

    const deIvan = await (await browser.newContext()).newPage();
    await entrar(deIvan, ajena);
    await expect(deIvan.getByText('Aún no hay documentos')).toBeVisible();
    await expect(deIvan.getByLabel('Categoría').locator('option', { hasText: 'Planillas' })).toHaveCount(0);
    // Ni con el enlace: para quien no tiene acceso, el documento no existe.
    await deIvan.goto(`/documentos/${id}`);
    await expect(deIvan.getByRole('heading', { name: 'Este documento no existe' })).toBeVisible();
  });

  test('RF25 · Quitar el acceso a alguien surte efecto en su siguiente consulta', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const persona = await nuevaCuenta(request, empresa, 'usuario', 'Luis Temporal');
    await nuevaCategoria(request, empresa, 'Contratos laborales', [persona]);
    await subirDocumento(request, empresa.administrador, { nombre: 'Contrato de Luis', categoria: 'Contratos laborales' });

    await entrar(page, persona);
    await expect(page.getByRole('link', { name: 'Contrato de Luis' })).toBeVisible();

    const admin = await (await page.context().browser()!.newContext()).newPage();
    await entrar(admin, empresa.administrador);
    await admin.goto('/admin/categorias');
    await admin.getByRole('listitem').filter({ hasText: 'Contratos laborales' }).getByRole('button', { name: 'Editar' }).click();
    await admin.getByRole('dialog').getByRole('checkbox', { name: /Luis Temporal/ }).uncheck();
    await admin.getByRole('button', { name: 'Guardar' }).click();
    await expect(admin.getByText('Cambios guardados.')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Aún no hay documentos')).toBeVisible();
  });

  test('RF05, RF19 · Cada rol entra solo a lo suyo: lo demás responde «sin permiso» y queda en el historial @demo', async ({ page, request, browser }) => {
    const empresa = await nuevaEmpresa(request);
    const usuaria = await nuevaCuenta(request, empresa, 'usuario');

    // La usuaria no ve el menú de administración, y si abre sus pantallas a mano la API la rechaza.
    await entrar(page, usuaria);
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
    for (const ruta of ['/admin/tablero', '/admin/usuarios', '/admin/historial', '/admin/papelera', '/plataforma']) {
      await page.goto(ruta);
      await expect(page.getByText('No tienes permiso para ver esto'), ruta).toBeVisible();
    }

    // El administrador tampoco entra a la plataforma, y el Master no entra a una empresa.
    const admin = await (await browser.newContext()).newPage();
    await entrar(admin, empresa.administrador);
    await admin.goto('/plataforma/auditoria');
    await expect(admin.getByText('No tienes permiso para ver esto')).toBeVisible();
    const master = await (await browser.newContext()).newPage();
    await entrar(master, MASTER);
    await master.goto('/admin/tablero');
    await expect(master.getByText('No tienes permiso para ver esto')).toBeVisible();

    // Cada intento de la usuaria quedó en el historial de su empresa, con su nombre y lo que se exigía.
    await admin.goto('/admin/historial?accion=ACCESO_DENEGADO');
    const intentos = admin.getByRole('listitem').filter({ hasText: usuaria.nombre });
    for (const permiso of ['ver tablero', 'gestionar usuarios', 'consultar historial', 'gestionar papelera', 'gestionar plataforma']) {
      await expect(intentos.filter({ hasText: `exigía ${permiso}` }).first(), permiso).toBeVisible();
    }
  });
});
