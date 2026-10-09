import { expect, test } from '@playwright/test';
import { CLAVE, entrar, irDesdeElMenu, nuevaCategoria, nuevaCuenta, nuevaEmpresa, salir, subirDocumento, unico } from './apoyo';
import { MASTER, URL_WEB } from './entorno';

test.describe('Plataforma: el Administrador Master', () => {
  test('RF01 · El Master da de alta una empresa con su primer administrador, que entra y encuentra cinco categorías', async ({ page }) => {
    const sufijo = unico();
    await entrar(page, MASTER);
    await expect(page).toHaveURL(/\/plataforma$/);

    await page.getByRole('link', { name: 'Nueva empresa' }).first().click();
    await page.getByLabel('Nombre o razón social').fill(`Textiles ${sufijo} SAC`);
    await page.getByLabel('Nombre', { exact: true }).fill('Rosa Quispe');
    await page.getByLabel('Correo').fill(`rosa.${sufijo}@e2e.pe`);
    await page.getByLabel('Contraseña inicial').fill(CLAVE);
    await page.getByLabel('Repite la contraseña').fill(CLAVE);
    await page.getByRole('button', { name: 'Registrar empresa' }).click();

    await expect(page.getByText('Empresa registrada.')).toBeVisible();
    await expect(page.getByRole('heading', { name: `Textiles ${sufijo} SAC` })).toBeVisible();
    await salir(page);

    await entrar(page, { email: `rosa.${sufijo}@e2e.pe`, clave: CLAVE });
    await page.goto('/admin/categorias');
    for (const categoria of ['Facturas y boletas', 'Contratos', 'Cotizaciones', 'Recursos humanos', 'Otros']) {
      await expect(page.getByText(categoria, { exact: true })).toBeVisible();
    }
  });

  test('RF22 · El Master edita una empresa y al desactivarla nadie de ella puede entrar hasta que la reactiva', async ({ page, request, browser }) => {
    const empresa = await nuevaEmpresa(request);
    await entrar(page, MASTER);
    await page.getByRole('link', { name: new RegExp(empresa.nombre) }).click();

    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByLabel('Nombre o razón social').fill(`${empresa.nombre} EIRL`);
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('heading', { name: `${empresa.nombre} EIRL` })).toBeVisible();

    await page.getByRole('button', { name: 'Desactivar' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).click();
    await expect(page.getByText('Empresa desactivada: nadie de ella puede entrar')).toBeVisible();

    const visitante = await browser.newPage({ baseURL: URL_WEB, locale: 'es-PE' });
    await visitante.goto('/login');
    await visitante.getByLabel('Correo').fill(empresa.administrador.email);
    await visitante.getByLabel('Contraseña', { exact: true }).fill(empresa.administrador.clave);
    await visitante.getByRole('button', { name: 'Entrar' }).click();
    await expect(visitante.getByRole('alert')).toHaveText('Tu empresa está desactivada en la plataforma. Consulta con su administrador');

    await page.getByRole('button', { name: 'Reactivar' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reactivar' }).click();
    await expect(page.getByText('vuelve a estar activa')).toBeVisible();
    await visitante.getByRole('button', { name: 'Entrar' }).click();
    await expect(visitante).toHaveURL(/\/documentos$/);
    await visitante.close();
  });

  test('RF23 · El Master añade, edita y desactiva a los administradores de una empresa', async ({ page }) => {
    const sufijo = unico();
    await entrar(page, MASTER);
    await page.getByRole('link', { name: 'Nueva empresa' }).first().click();
    await page.getByLabel('Nombre o razón social').fill(`Consultora ${sufijo}`);
    await page.getByLabel('Nombre', { exact: true }).fill('Primer administrador');
    await page.getByLabel('Correo').fill(`primero.${sufijo}@e2e.pe`);
    await page.getByLabel('Contraseña inicial').fill(CLAVE);
    await page.getByLabel('Repite la contraseña').fill(CLAVE);
    await page.getByRole('button', { name: 'Registrar empresa' }).click();

    // Los campos se buscan en el diálogo: detrás, la ficha tiene los de su identidad («Nombre comercial»).
    const dialogo = page.getByRole('dialog');
    await page.getByRole('button', { name: 'Nuevo administrador' }).click();
    await dialogo.getByLabel('Nombre').fill('Luis Huamán');
    await dialogo.getByLabel('Correo').fill(`luis.${sufijo}@e2e.pe`);
    await dialogo.getByLabel(/^DNI/).fill('45678912');
    await dialogo.getByLabel('Contraseña inicial').fill(CLAVE);
    await page.getByRole('button', { name: 'Crear administrador' }).click();
    const fila = page.getByRole('listitem').filter({ hasText: `luis.${sufijo}@e2e.pe` });
    await expect(fila).toContainText('DNI 45678912');

    await fila.getByRole('button', { name: 'Editar' }).click();
    await dialogo.getByLabel('Nombre').fill('Luis Huamán Rojas');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(fila).toContainText('Luis Huamán Rojas');

    await fila.getByRole('button', { name: 'Desactivar' }).click();
    await expect(page.getByText('Luis Huamán Rojas ya no puede entrar; sus sesiones se cerraron.')).toBeVisible();
    await expect(fila.getByText('Desactivado')).toBeVisible();
  });

  test('RF24 · El Master ve las cifras de cada empresa, pero nunca sus documentos', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const usuaria = await nuevaCuenta(request, empresa, 'usuario');
    await subirDocumento(request, usuaria, { nombre: 'Contrato confidencial' });
    await entrar(page, MASTER);

    const fila = page.getByRole('listitem').filter({ hasText: empresa.nombre });
    await expect(fila).toContainText('2 usuarios activos · 1 documento');
    await fila.getByRole('link').click();
    await expect(page.getByRole('heading', { name: empresa.nombre })).toBeVisible();
    await expect(page.getByText('Usuarios activos', { exact: true })).toBeVisible();
    await expect(page.getByText('2 de 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Contrato confidencial')).toHaveCount(0);

    // Ni siquiera abriendo la pantalla de documentos a mano: la API lo rechaza y lo registra (decisión E).
    await page.goto('/documentos');
    await expect(page.getByText('No tienes permiso para ver esto')).toBeVisible();
    await expect(page.getByText('Contrato confidencial')).toHaveCount(0);
  });

  test('RF27 · El Master audita lo que hizo la plataforma, sin ver la actividad dentro de las empresas @demo', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    await nuevaCategoria(request, empresa, 'Categoría interna');
    await entrar(page, MASTER);

    await irDesdeElMenu(page, 'Auditoría');
    await page.getByLabel('Empresa').selectOption({ label: empresa.nombre });
    await expect(page).toHaveURL(new RegExp(`empresaId=${empresa.id}`));
    const registro = page.getByRole('listitem').filter({ hasText: 'Empresa registrada' });
    await expect(registro).toHaveCount(1);
    await expect(registro).toContainText(empresa.nombre);
    await expect(registro).toContainText('Administración de la plataforma');
    // La categoría que creó el administrador de la empresa es actividad de la empresa: aquí no aparece.
    await expect(page.getByRole('listitem').filter({ hasText: 'Categoría interna' })).toHaveCount(0);
  });

  test('RF29 · El Master genera un respaldo de la base y lo ve en la lista, sin poder descargarlo', async ({ page }) => {
    await entrar(page, MASTER);
    await irDesdeElMenu(page, 'Respaldos');

    await page.getByRole('button', { name: 'Generar respaldo ahora' }).click();
    await expect(page.getByText(/^Respaldo guardado/)).toBeVisible();
    await expect(page.getByRole('listitem')).not.toHaveCount(0);
    await expect(page.getByRole('link', { name: /descargar/i })).toHaveCount(0);

    // La portada lo resume: el último respaldo y el espacio frente al límite gratuito.
    await irDesdeElMenu(page, 'Empresas');
    await expect(page.getByText(/respaldos? guardados?/)).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Espacio de archivos usado' })).toBeVisible();
  });
});
