import { describe, expect, it } from 'vitest';
import { generarDocumentos } from '../../scripts/documentos-de-prueba.js';
import { pdfDeTexto } from '../../scripts/pdf-de-texto.js';
import { identificarTipo } from '../../src/compartido/tipos-de-archivo.js';

describe('Documentos de prueba con datos ficticios (D34)', () => {
  it('genera el lote: cuarenta PDF con nombre, categoría y fecha distintos, que la API acepta como PDF', () => {
    const documentos = generarDocumentos();

    expect(documentos).toHaveLength(40);
    expect(new Set(documentos.map((d) => d.archivo)).size).toBe(40);
    expect(new Set(documentos.map((d) => d.nombre)).size).toBe(40);
    expect(new Set(documentos.map((d) => d.categoria))).toEqual(new Set([
      'Facturas y boletas', 'Guías de remisión', 'Órdenes de compra', 'Cotizaciones', 'Contratos', 'Recursos humanos', 'Otros',
    ]));
    for (const documento of documentos) {
      expect(identificarTipo(documento.archivo, documento.contenido)).toEqual({ extension: 'pdf', mime: 'application/pdf' });
      expect(documento.fecha).toMatch(/^202[56]-\d{2}-\d{2}$/);
    }
  });

  it('siempre el mismo juego: quien lo genera dos veces obtiene los mismos archivos', () => {
    const [primero, segundo] = [generarDocumentos(8), generarDocumentos(8)];
    expect(segundo.map((d) => d.contenido.toString('base64'))).toEqual(primero.map((d) => d.contenido.toString('base64')));
  });

  it('cada documento dice que sus datos son ficticios', () => {
    for (const documento of generarDocumentos(8)) expect(documento.contenido.toString('latin1')).toContain('DATOS FICTICIOS');
  });

  it('escribe un PDF válido: la tabla de referencias apunta a cada objeto, y las tildes van en WinAnsi', () => {
    const pdf = pdfDeTexto([{ texto: 'Guía de remisión N° 1 (ñandú) «prueba» — fin', estilo: 'titulo' }]);
    const texto = pdf.toString('latin1');

    const inicio = Number(/startxref\n(\d+)/.exec(texto)![1]);
    expect(texto.slice(inicio, inicio + 4)).toBe('xref');
    const posiciones = [...texto.slice(inicio).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(posiciones).toHaveLength(6);
    posiciones.forEach((posicion, i) => expect(texto.slice(posicion, posicion + 8)).toBe(`${i + 1} 0 obj\n`));
    expect(texto).toContain('(Gu\xeda de remisi\xf3n N\xb0 1 \\(\xf1and\xfa\\) \xabprueba\xbb - fin) Tj');
    const largo = Number(/\/Length (\d+)/.exec(texto)![1]);
    expect(texto.indexOf('\nendstream') - (texto.indexOf('stream\n') + 7)).toBe(largo);
  });
});
