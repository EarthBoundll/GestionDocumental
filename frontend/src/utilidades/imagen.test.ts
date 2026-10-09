import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepararFondo, problemaDeFondo } from './imagen';

/**
 * jsdom no decodifica imágenes ni dibuja: se imita un navegador con una foto de cierto tamaño, que escribe WebP
 * o no, y cuyo resultado pesa lo que diga `peso` según la calidad pedida.
 */
function simularNavegador({ ancho, alto, escribeWebp = true, peso = () => 200 * 1024 }: {
  ancho: number; alto: number; escribeWebp?: boolean; peso?: (calidad: number) => number;
}) {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: ancho, height: alto, close: vi.fn() })));
  const dibujada: { ancho?: number; alto?: number } = {};
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    fillRect() {},
    drawImage(_imagen: unknown, _x: number, _y: number, w: number, h: number) {
      dibujada.ancho = w;
      dibujada.alto = h;
    },
  }) as unknown as CanvasRenderingContext2D);
  const pedidos: string[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((listo, tipo = 'image/png', calidad = 1) => {
    pedidos.push(`${tipo} ${calidad}`);
    // Como un navegador de verdad: si no sabe escribir el tipo pedido, entrega un PNG.
    const escrito = tipo === 'image/webp' && !escribeWebp ? 'image/png' : tipo;
    listo(new Blob([new Uint8Array(peso(calidad as number))], { type: escrito }));
  });
  return { dibujada, pedidos };
}

const foto = (nombre = 'taller del centro.jpg', tipo = 'image/jpeg') => new File([new Uint8Array(10)], nombre, { type: tipo });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('La imagen de fondo se prepara en el navegador (D39)', () => {
  it('una foto grande se reduce a 1920 px por su lado mayor y se sube en WebP, con su nombre', async () => {
    const { dibujada } = simularNavegador({ ancho: 4032, alto: 3024 });

    const preparada = await prepararFondo(foto());

    expect(dibujada).toEqual({ ancho: 1920, alto: 1440 });
    expect(preparada.type).toBe('image/webp');
    expect(preparada.name).toBe('taller del centro.webp');
    expect(preparada.size).toBeLessThanOrEqual(480 * 1024);
  });

  it('si el navegador no escribe WebP, la sube en JPG', async () => {
    const { pedidos } = simularNavegador({ ancho: 1600, alto: 900, escribeWebp: false });

    const preparada = await prepararFondo(foto('fondo.png', 'image/png'));

    expect(preparada).toMatchObject({ type: 'image/jpeg', name: 'fondo.jpg' });
    expect(pedidos).toEqual(['image/webp 0.82', 'image/jpeg 0.82']);
  });

  it('si pesa demasiado, baja la calidad; si ni así cabe, lo dice', async () => {
    const { pedidos } = simularNavegador({ ancho: 1920, alto: 1080, peso: (calidad) => (calidad > 0.6 ? 600 * 1024 : 300 * 1024) });
    expect((await prepararFondo(foto())).size).toBe(300 * 1024);
    expect(pedidos).toEqual(['image/webp 0.82', 'image/webp 0.7', 'image/webp 0.55']);

    simularNavegador({ ancho: 1920, alto: 1080, peso: () => 900 * 1024 });
    await expect(prepararFondo(foto())).rejects.toThrow('La imagen tiene demasiado detalle para un fondo');
  });

  it('una imagen pequeña se vería borrosa: no se sube', async () => {
    simularNavegador({ ancho: 800, alto: 600 });

    await expect(prepararFondo(foto())).rejects.toThrow('La imagen es pequeña (800 × 600 px) y se vería borrosa. Usa una de al menos 1000 px de ancho');
  });

  it('lo que no es JPG, PNG ni WebP, o pasa de 15 MB, se rechaza antes de leerlo', () => {
    expect(problemaDeFondo(foto('fondo.gif', 'image/gif'))).toBe('El fondo debe ser una imagen JPG, PNG o WebP');
    expect(problemaDeFondo(foto('fondo.svg', 'image/svg+xml'))).toBe('El fondo debe ser una imagen JPG, PNG o WebP');
    expect(problemaDeFondo(new File([new Uint8Array(16 * 1024 * 1024)], 'enorme.jpg', { type: 'image/jpeg' }))).toBe('La imagen supera los 15 MB');
    expect(problemaDeFondo(foto())).toBeNull();
  });
});
