import { describe, expect, it } from 'vitest';
import { esMovil } from '../../src/compartido/dispositivo.js';
import { tienePermiso } from '../../src/compartido/permisos.js';

describe('esMovil (indicador 5)', () => {
  it.each([
    ['iPhone con Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', true],
    ['Android con Chrome', 'Mozilla/5.0 (Linux; Android 15; SM-A256E) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36', true],
    ['Windows con Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36', false],
    ['Mac con Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', false],
  ])('%s', (_caso, userAgent, esperado) => {
    expect(esMovil(userAgent)).toBe(esperado);
  });

  it('la cabecera Sec-CH-UA-Mobile manda sobre el user-agent cuando el navegador la envía', () => {
    expect(esMovil('Mozilla/5.0 (Windows NT 10.0)', '?1')).toBe(true);
    expect(esMovil('Mozilla/5.0 (Linux; Android 15) Mobile', '?0')).toBe(false);
  });

  it('sin user-agent no se presume móvil', () => {
    expect(esMovil(null)).toBe(false);
  });
});

describe('tienePermiso (docs/01-analisis.md §6)', () => {
  it.each([
    'GESTIONAR_USUARIOS', 'GESTIONAR_CATEGORIAS', 'VER_CATEGORIAS_INACTIVAS', 'GESTIONAR_CUALQUIER_DOCUMENTO',
    'GESTIONAR_PAPELERA', 'VER_TODAS_LAS_SOLICITUDES', 'RESOLVER_SOLICITUDES', 'CONSULTAR_HISTORIAL',
  ] as const)('%s es solo del administrador', (permiso) => {
    expect(tienePermiso('administrador', permiso)).toBe(true);
    expect(tienePermiso('usuario', permiso)).toBe(false);
  });
});
