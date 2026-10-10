import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { enlaceDelCorreo, entrar, nuevaCuenta, nuevaEmpresa, salir, subirDocumento, unico } from './apoyo';

test.describe('Administración de la empresa', () => {
  test('RF13, RF37, RF38 · El administrador invita a una persona y ve que está pendiente; reenviar enseguida se frena; ella activa su cuenta con su correo; él le cambia el nombre y el rol, y restablece su contraseña', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const sufijo = unico();
    const correo = `ana.${sufijo}@e2e.pe`;
    await entrar(page, empresa.administrador);
    await page.goto('/admin/usuarios');

    // D41: la cuenta nace sin contraseña; la elige su dueña al abrir la invitación.
    const dialogo = page.getByRole('dialog');
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    await expect(dialogo.getByLabel(/Contraseña/)).toHaveCount(0);
    await dialogo.getByLabel('Nombre').fill('Ana Torres');
    await dialogo.getByLabel('Correo').fill(correo);
    await dialogo.getByLabel(/^DNI/).fill('70123456');
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText(`Le enviamos a ${correo} una invitación.`)).toBeVisible();
    const fila = page.getByRole('listitem').filter({ hasText: correo });
    await expect(fila.getByText('Pendiente de activar')).toBeVisible();

    // El correo es único en todo el sistema (RN02); en la misma empresa, se dice que ya está.
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    await dialogo.getByLabel('Nombre').fill('Otra Ana');
    await dialogo.getByLabel('Correo').fill(correo);
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Esa persona ya tiene una cuenta en tu empresa');
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // Reenviar enseguida no inunda su buzón: hay que esperar (D41).
    await fila.getByRole('button', { name: 'Reenviar invitación' }).click();
    await expect(page.getByRole('alert')).toContainText('Espera 2 minuto(s)');

    await fila.getByRole('button', { name: 'Editar' }).click();
    await expect(dialogo.getByLabel(/Contraseña/)).toHaveCount(0);
    await dialogo.getByLabel('Nombre').fill('Ana Torres Ríos');
    await dialogo.getByLabel('Rol').selectOption('administrador');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(fila).toContainText('Ana Torres Ríos');
    await expect(fila).toContainText('Administrador');

    // Nadie cambia su propio rol (RN03).
    await page.getByRole('listitem').filter({ hasText: '(tú)' }).getByRole('button', { name: 'Editar' }).click();
    await expect(dialogo.getByLabel('Rol')).toBeDisabled();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await salir(page);

    // Ana abre su invitación, define su contraseña y entra con el correo ya escrito.
    await page.goto(enlaceDelCorreo(correo, '/activar-cuenta'));
    await expect(page).toHaveURL(/\/activar-cuenta$/); // el token sale de la barra de direcciones
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('elegida-por-ana-1');
    await page.getByLabel('Repite la contraseña nueva').fill('elegida-por-ana-1');
    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page.getByText('Tu cuenta está activa y tu correo quedó confirmado.')).toBeVisible();
    await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByLabel('Correo')).toHaveValue(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill('elegida-por-ana-1');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Historial' })).toBeVisible();
    await salir(page);

    // Ya activa, su administrador puede restablecerle la contraseña.
    await entrar(page, empresa.administrador);
    await page.goto('/admin/usuarios');
    await expect(fila.getByText('Pendiente de activar')).toHaveCount(0);
    await fila.getByRole('button', { name: 'Editar' }).click();
    await dialogo.getByLabel(/^Contraseña nueva/).fill('restablecida-clave-5');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Con la contraseña nueva, sus sesiones abiertas se cerraron.')).toBeVisible();
    await salir(page);
    await entrar(page, { email: correo, clave: 'restablecida-clave-5' });
  });

  test('RF14 · Desactivar a un usuario le impide entrar y conserva sus documentos; reactivarlo se lo devuelve', async ({ page, request, browser }) => {
    const empresa = await nuevaEmpresa(request);
    const pedro = await nuevaCuenta(request, empresa, 'usuario', 'Pedro Salas');
    await subirDocumento(request, pedro, { nombre: 'Guía de remisión 118' });
    await entrar(page, empresa.administrador);
    await page.goto('/admin/usuarios');
    const fila = page.getByRole('listitem').filter({ hasText: 'Pedro Salas' });

    await fila.getByRole('button', { name: 'Desactivar' }).click();
    await expect(page.getByText('Pedro Salas ya no puede entrar; sus sesiones se cerraron.')).toBeVisible();
    await expect(fila.getByText('Desactivado')).toBeVisible();

    const visitante = await browser.newPage({ baseURL: test.info().project.use.baseURL, locale: 'es-PE' });
    await visitante.goto('/login');
    await visitante.getByLabel('Correo').fill(pedro.email);
    await visitante.getByLabel('Contraseña', { exact: true }).fill(pedro.clave);
    await visitante.getByRole('button', { name: 'Entrar' }).click();
    await expect(visitante.getByRole('alert')).toHaveText('Tu cuenta está desactivada. Consulta con el administrador de tu empresa');

    await page.goto('/documentos');
    await expect(page.getByRole('link', { name: 'Guía de remisión 118' })).toBeVisible();

    await page.goto('/admin/usuarios');
    await fila.getByRole('button', { name: 'Reactivar' }).click();
    await expect(page.getByText('Pedro Salas puede volver a entrar.')).toBeVisible();
    await visitante.getByRole('button', { name: 'Entrar' }).click();
    await expect(visitante).toHaveURL(/\/documentos$/);
    await visitante.close();
  });

  test('RF05, RF19 · Cada acción queda en el historial con su autor, y se filtra por persona y acción', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    await subirDocumento(request, ana, { nombre: 'Contrato de alquiler' });
    await entrar(page, ana);
    await page.getByLabel('Buscar por nombre').fill('alquiler');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar Contrato de alquiler' }).click()]);
    await descarga.path();
    // Una pantalla que no es de su rol: la API la niega y lo registra (indicador 6).
    await page.goto('/admin/historial');
    await expect(page.getByText('No tienes permiso para ver esto')).toBeVisible();
    await salir(page);

    await entrar(page, empresa.administrador);
    await page.goto('/admin/historial');
    await page.getByLabel('Persona').selectOption({ label: 'Ana Torres' });
    const asientos = page.locator('main ul > li');
    for (const [accion, detalle] of [
      ['Cierre de sesión', ''],
      ['Acceso denegado', 'exigía consultar historial en /historial'],
      ['Documento descargado', '«Contrato de alquiler»'],
      ['Búsqueda', 'buscó «alquiler» · 1 resultado'],
      ['Inicio de sesión', ''],
      ['Documento subido', '«Contrato de alquiler» · en Otros'],
    ]) {
      await expect(asientos.filter({ hasText: accion }).filter({ hasText: detalle }).first()).toBeVisible();
    }

    await page.getByLabel('Acción', { exact: true }).selectOption({ label: 'Documento descargado' });
    await expect(asientos).toHaveCount(1);
    await expect(asientos).toContainText('Ana Torres');
  });

  test('RF20 · El historial se exporta a CSV con tildes legibles en Excel y su fecha en el nombre', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    await entrar(page, empresa.administrador);
    await page.goto('/admin/historial');

    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar a CSV' }).click()]);
    expect(descarga.suggestedFilename()).toMatch(/^historial-\d{4}-\d{2}-\d{2}\.csv$/);
    const csv = readFileSync((await descarga.path())!, 'utf8');
    expect(csv.startsWith('﻿id,fecha_hora_lima,fecha_hora_utc,accion,')).toBe(true);
    expect(csv).toContain('EMPRESA_CREADA');
    expect(csv).toContain('Administración de la plataforma');
  });
});
