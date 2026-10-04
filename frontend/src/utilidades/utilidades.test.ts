import { describe, expect, it } from 'vitest';
import { NOMBRES_DE_ACCIONES, resumirDetalle } from './acciones';
import { problemaConArchivo } from './archivos';
import { contar, formatearFecha, formatearFechaHora, formatearPeso, nombreDeTipo, nombreSugerido } from './formato';
import { destinoTrasEntrar, inicioDe } from './roles';

describe('formato', () => {
  it('muestra los instantes en hora de Lima, esté donde esté el navegador (M10)', () => {
    // 3 de octubre a las 04:30 UTC son las 23:30 del 2 en Lima.
    expect(formatearFechaHora('2026-10-03T04:30:00Z')).toBe('02/10/2026 23:30');
  });

  it('la fecha de un documento no se convierte de zona: es un día, no un instante', () => {
    expect(formatearFecha('2026-09-15')).toBe('15/09/2026');
  });

  it('pesos legibles', () => {
    expect(formatearPeso(512)).toBe('512 B');
    expect(formatearPeso(482_133)).toBe('471 KB');
    expect(formatearPeso(10 * 1024 * 1024)).toBe('10,0 MB');
  });

  it('el nombre sugerido al subir sale del archivo, legible y con mayúscula', () => {
    expect(nombreSugerido('contrato_alquiler-local.pdf')).toBe('Contrato alquiler local');
    expect(nombreSugerido('cotización__telas  2026.final.xlsx')).toBe('Cotización telas 2026.final');
  });

  it('concuerda el número con el sustantivo', () => {
    expect(contar(1, 'documento')).toBe('1 documento');
    expect(contar(0, 'documento')).toBe('0 documentos');
    expect(contar(2, 'usuario activo', 'usuarios activos')).toBe('2 usuarios activos');
    expect(contar(1500, 'resultado')).toBe('1,500 resultados');
  });

  it('nombra los tipos admitidos y deja «Archivo» para los demás', () => {
    expect(nombreDeTipo('application/pdf')).toBe('PDF');
    expect(nombreDeTipo('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('Excel');
    expect(nombreDeTipo('application/zip')).toBe('Archivo');
  });
});

describe('roles', () => {
  it('cada rol tiene su portada: el Master, la plataforma', () => {
    expect(inicioDe('master')).toBe('/plataforma');
    expect(inicioDe('administrador')).toBe('/documentos');
    expect(inicioDe('usuario')).toBe('/documentos');
  });

  it('tras caducar la sesión se vuelve a donde se estaba, si esa pantalla es de su rol', () => {
    expect(destinoTrasEntrar('usuario', '/documentos/abc?x=1')).toBe('/documentos/abc?x=1');
    expect(destinoTrasEntrar('master', '/plataforma/empresas/abc')).toBe('/plataforma/empresas/abc');
    expect(destinoTrasEntrar('master', '/cuenta')).toBe('/cuenta');
  });

  it('si entra otra persona con otro rol, va a su portada y no a la pantalla del anterior', () => {
    expect(destinoTrasEntrar('master', '/documentos')).toBe('/plataforma');
    expect(destinoTrasEntrar('administrador', '/plataforma')).toBe('/documentos');
    expect(destinoTrasEntrar('usuario', undefined)).toBe('/documentos');
    expect(destinoTrasEntrar('usuario', '/')).toBe('/documentos');
    expect(destinoTrasEntrar('usuario', 'https://otro-sitio.pe')).toBe('/documentos');
  });
});

describe('historial', () => {
  it('nombra las 30 acciones auditables de docs/01-analisis.md §7', () => {
    expect(Object.keys(NOMBRES_DE_ACCIONES)).toHaveLength(30);
  });

  it('resume el detalle en frases: qué documento, qué buscó, qué cambió', () => {
    expect(resumirDetalle({ nombre: 'Contrato del local' })).toEqual(['«Contrato del local»']);
    expect(resumirDetalle({ filtros: { q: 'factura', categoriaId: 'x', desde: '2026-09-01', hasta: '2026-09-30' }, resultados: 1 }))
      .toEqual(['buscó «factura»', 'por categoría', 'del 01/09/2026 al 30/09/2026', '1 resultado']);
    expect(resumirDetalle({ cambios: { categoriaId: {}, fechaDocumento: {}, clave: {} } })).toEqual(['cambió categoría, fecha, contraseña']);
    expect(resumirDetalle({ filtros: {}, filas: 12 })).toEqual(['12 filas exportadas']);
  });

  it('un acceso denegado dice qué se exigía y dónde, sin el prefijo técnico de la API', () => {
    expect(resumirDetalle({ permiso: 'GESTIONAR_USUARIOS', metodo: 'GET', ruta: '/api/v1/usuarios' })).toEqual(['exigía gestionar usuarios en /usuarios']);
  });

  it('una categoría restringida dice para quién, y un cambio de accesos a quién se dio y a quién se quitó (RF25)', () => {
    expect(resumirDetalle({ nombre: 'Planillas', restringida: true, autorizados: ['Ana', 'Luis'] }))
      .toEqual(['«Planillas»', 'restringida', 'para Ana, Luis']);
    expect(resumirDetalle({ cambios: {}, accesos: { anadidos: ['Ana'], quitados: ['Luis'] } }))
      .toEqual(['dio acceso a Ana', 'quitó acceso a Luis']);
  });

  it('las sesiones cerradas solo se mencionan si hubo alguna', () => {
    expect(resumirDetalle({ nombre: 'Ana', sesionesCerradas: 0 })).toEqual(['«Ana»']);
    expect(resumirDetalle({ nombre: 'Ana', sesionesCerradas: 2 })).toEqual(['«Ana»', '2 sesiones cerradas']);
  });
});

describe('archivos', () => {
  const archivo = (nombre: string, bytes = 10) => new File([new Uint8Array(bytes)], nombre);

  it('admite los tipos de RN09, sin distinguir mayúsculas en la extensión', () => {
    expect(problemaConArchivo(archivo('factura.PDF'))).toBeNull();
    expect(problemaConArchivo(archivo('foto.jpeg'))).toBeNull();
  });

  it('rechaza otros tipos y lo que pasa de 10 MB antes de enviarlo', () => {
    expect(problemaConArchivo(archivo('notas.txt'))).toMatch(/Solo se admiten/);
    expect(problemaConArchivo(archivo('sin-extension'))).toMatch(/Solo se admiten/);
    expect(problemaConArchivo(archivo('grande.pdf', 10 * 1024 * 1024 + 1))).toBe('El archivo supera los 10 MB');
  });
});
