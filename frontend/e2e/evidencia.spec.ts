import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { entrar, nuevaCuenta, nuevaEmpresa, subirDocumento } from './apoyo';

/** La luminosidad de un color de CSS, de 0 (negro) a 1 (blanco): Chrome los da en oklch o en rgb. */
function luminosidad(color: string): number {
  const oklch = /oklch\(([\d.]+)(%?)/.exec(color);
  if (oklch) return Number(oklch[1]) / (oklch[2] ? 100 : 1);
  const [r = 0, g = 0, b = 0] = (/rgba?\(([^)]+)\)/.exec(color)?.[1] ?? '').split(',').map(Number);
  return (r + g + b) / 765;
}

test.describe('Evidencia para el capítulo 3', () => {
  test('RF35 · El administrador exporta el inventario documental en CSV, con lo filtrado en la pantalla', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    await subirDocumento(request, ana, { nombre: 'Contrato de alquiler', categoria: 'Contratos' });
    await subirDocumento(request, ana, { nombre: 'Factura 002', categoria: 'Facturas y boletas', fecha: '2026-09-20' });
    await subirDocumento(request, empresa.administrador, { nombre: 'Factura 001', categoria: 'Facturas y boletas', fecha: '2026-09-10' });

    await entrar(page, empresa.administrador);
    await page.goto('/documentos');
    await page.getByLabel('Categoría').selectOption({ label: 'Facturas y boletas' });
    await expect(page.getByRole('link', { name: 'Contrato de alquiler' })).toBeHidden();
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar listado' }).click()]);

    expect(descarga.suggestedFilename()).toMatch(/^listado-documental-\d{4}-\d{2}-\d{2}\.csv$/);
    const [encabezado, ...filas] = readFileSync((await descarga.path())!, 'utf8').slice(1).trim().split('\r\n');
    expect(encabezado).toBe('id,nombre,categoria,fecha_documento,descripcion,subido_por,subido_en_lima,tipo,peso_bytes,version_vigente,estado_aprobacion,version_revisada');
    // Por fecha dentro de la categoría, con quién lo subió y su estado de aprobación.
    expect(filas.map((fila) => fila.split(',').slice(1, 4).join(' | '))).toEqual([
      'Factura 001 | Facturas y boletas | 2026-09-10',
      'Factura 002 | Facturas y boletas | 2026-09-20',
    ]);
    expect(filas[1]).toContain(',Ana Torres,');
    expect(filas[1]).toMatch(/,PDF,\d+,1,sin solicitud,$/);

    // Exportarlo queda en el historial (indicador 4).
    await page.goto('/admin/historial');
    await expect(page.getByRole('listitem').filter({ hasText: 'Listado documental exportado' }).first())
      .toContainText('por categoría · 2 filas exportadas');
  });

  test('RF36 · El historial filtrado se imprime entero, sin menús y en claro aunque la persona use el modo oscuro', async ({ page, request }) => {
    const empresa = await nuevaEmpresa(request);
    const ana = await nuevaCuenta(request, empresa, 'usuario', 'Ana Torres');
    // Su cuenta confirmó el correo al aceptar la invitación (D41), y cada subida inicia sesión y sube: 25 acciones,
    // más de una página del historial (20).
    for (let n = 1; n <= 12; n++) await subirDocumento(request, ana, { nombre: `Guía de remisión ${n}` });

    await page.emulateMedia({ colorScheme: 'dark' });
    await entrar(page, empresa.administrador);
    await page.goto('/admin/historial');
    await page.getByLabel('Persona').selectOption({ label: 'Ana Torres' });
    await expect(page.getByRole('navigation', { name: 'Paginación' })).toBeVisible();
    await page.getByRole('link', { name: 'Imprimir' }).click();

    const tabla = page.getByRole('table');
    await expect(tabla.getByRole('row')).toHaveCount(26);
    await expect(tabla.getByRole('cell', { name: '«Guía de remisión 1» · en Otros', exact: true })).toBeVisible();
    await expect(tabla.getByRole('cell', { name: '«Guía de remisión 12» · en Otros', exact: true })).toBeVisible();
    await expect(page.getByText('Ana Torres', { exact: true }).and(page.locator('dd'))).toBeVisible();
    const enPantalla = await tabla.evaluate((elemento) => getComputedStyle(elemento).color);

    // Como lo ve el diálogo de imprimir: sin menú, sin barra, sin botones, y el texto oscuro sobre el papel.
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    await expect(page.getByRole('banner')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Imprimir o guardar como PDF' })).toBeHidden();
    const impreso = await tabla.evaluate((elemento) => getComputedStyle(elemento).color);
    expect(luminosidad(enPantalla)).toBeGreaterThan(0.6);
    expect(luminosidad(impreso)).toBeLessThan(0.4);
    // «Guardar como PDF» es el mismo motor de impresión de Chromium.
    const pdf = await page.pdf({ format: 'A4' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    // Pedir la hoja para imprimir queda en el historial como una exportación (indicador 4).
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('link', { name: 'Volver al historial' }).click();
    await expect(page).toHaveURL(/\/admin\/historial\?usuarioId=/);
    await page.getByLabel('Persona').selectOption({ label: 'Todas' });
    await expect(page.getByRole('listitem').filter({ hasText: 'Historial exportado' }).first()).toContainText('25 filas para imprimir');
  });
});
