import { expect, test, type Page } from '@playwright/test';
import { entrar, nuevaCuenta, nuevaEmpresa, subirDocumento } from './apoyo';

const campana = (page: Page) => page.getByRole('button', { name: /^Notificaciones/ });

test.describe('Aprobación de un nivel y notificaciones', () => {
  test('RF15, RF17 · La usuaria pide aprobar su documento y los administradores reciben el aviso', async ({ page, request, browser }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const id = await subirDocumento(request, ana, { nombre: 'Orden de compra 0032' });

    await entrar(page, ana);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Solicitar aprobación' }).click();
    await page.getByLabel(/^Comentario/).fill('Para pagar al proveedor esta semana');
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByText('La solicitud se envió a los administradores.')).toBeVisible();
    await expect(page.getByText('Pendiente de aprobación').first()).toBeVisible();
    // Mientras está pendiente no se pide otra, ni se puede eliminar (RN11, RN12).
    await expect(page.getByRole('button', { name: 'Solicitar aprobación' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);

    const administrador = await browser.newPage({ baseURL: test.info().project.use.baseURL, locale: 'es-PE' });
    await entrar(administrador, empresa.administrador);
    await expect(campana(administrador)).toHaveAccessibleName('Notificaciones: 1 sin leer');
    await campana(administrador).click();
    await administrador.getByRole('button', { name: /Ana Torres pide aprobar «Orden de compra 0032»/ }).click();
    await expect(administrador).toHaveURL(new RegExp(`/documentos/${id}$`));
    await expect(administrador.getByRole('button', { name: 'Aprobar' })).toBeVisible();
    await administrador.close();
  });

  test('RF16 · El administrador rechaza con motivo obligatorio y, tras una nueva solicitud, aprueba @demo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const id = await subirDocumento(request, ana, { nombre: 'Factura del proveedor' });
    await entrar(page, ana);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Solicitar aprobación' }).click();
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByText('La solicitud se envió')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await entrar(page, empresa.administrador);
    await page.goto('/solicitudes?estado=pendiente');
    await page.getByRole('link', { name: 'Factura del proveedor' }).click();
    await page.getByRole('button', { name: 'Rechazar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Rechazar' }).click();
    await expect(page.getByText('Explica por qué la rechazas')).toBeVisible();
    await page.getByLabel(/^Motivo del rechazo/).fill('Falta el sello del proveedor');
    await page.getByRole('dialog').getByRole('button', { name: 'Rechazar' }).click();
    await expect(page.getByText('Rechazaste el documento.')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await entrar(page, ana);
    await page.goto(`/documentos/${id}`);
    // El motivo está en la tarjeta de aprobación (y también en la actividad del documento, RF30).
    await expect(page.locator('blockquote').filter({ hasText: 'Falta el sello del proveedor' })).toBeVisible();
    await page.getByRole('button', { name: 'Solicitar aprobación' }).click();
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByText('La solicitud se envió')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await entrar(page, empresa.administrador);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await page.getByLabel(/^Comentario/).fill('Conforme');
    await page.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText('Aprobaste el documento.')).toBeVisible();
    await expect(page.getByText('Aprobado', { exact: true }).first()).toBeVisible();
  });

  test('RF16 · Nadie aprueba lo suyo: el administrador que pide aprobación no ve los botones; otro administrador sí', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const segundo = await nuevaCuenta(request, empresa, 'administrador', 'Luis Huamán');
    const id = await subirDocumento(request, empresa.administrador, { nombre: 'Contrato del local' });

    await entrar(page, empresa.administrador);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Solicitar aprobación' }).click();
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByText('La solicitud se envió')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await entrar(page, segundo);
    await page.goto(`/documentos/${id}`);
    await expect(page.getByRole('button', { name: 'Aprobar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rechazar' })).toBeVisible();
  });

  test('RF17, RF18 · La solicitante recibe la decisión, la consulta en sus solicitudes y marca los avisos como leídos', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    const id = await subirDocumento(request, ana, { nombre: 'Planilla de septiembre', categoria: 'Recursos humanos' });
    await entrar(page, ana);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Solicitar aprobación' }).click();
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByText('La solicitud se envió')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await entrar(page, empresa.administrador);
    await page.goto(`/documentos/${id}`);
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
    await expect(page.getByText('Aprobaste el documento.')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await entrar(page, ana);
    await expect(campana(page)).toHaveAccessibleName('Notificaciones: 1 sin leer');
    await page.goto('/solicitudes');
    await expect(page.getByRole('heading', { name: 'Mis solicitudes' })).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: 'Planilla de septiembre' })).toContainText('Aprobado');

    await page.goto('/notificaciones');
    await expect(page.getByText(`${empresa.administrador.nombre} aprobó «Planilla de septiembre»`)).toBeVisible();
    await page.getByRole('button', { name: 'Marcar todas como leídas' }).click();
    await expect(campana(page)).toHaveAccessibleName('Notificaciones');
    await expect(page.getByRole('button', { name: 'Marcar todas como leídas' })).toHaveCount(0);
  });
});
