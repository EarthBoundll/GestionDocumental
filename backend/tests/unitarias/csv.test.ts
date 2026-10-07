import { describe, expect, it } from 'vitest';
import { aCsv } from '../../src/compartido/csv.js';

const filas = (csv: string) => csv.slice(1).split('\r\n');

describe('CSV', () => {
  it('empieza con la marca que Excel necesita para leer las tildes, y escapa comas, comillas y saltos', () => {
    const csv = aCsv(['nombre', 'detalle'], [['Guía, «remisión»', 'dijo "sí"\nfin']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(filas(csv)[1]).toBe('"Guía, «remisión»","dijo ""sí""\nfin"');
  });

  it('un texto que Excel tomaría por fórmula sale como texto (inyección CSV)', () => {
    const csv = aCsv(['nombre'], [['=HYPERLINK("http://x.pe","clic")'], ['+51 999'], ['-borrador'], ['@SUMA(A1)'], ['Factura 1']]);
    expect(filas(csv).slice(1, 6)).toEqual(['"\'=HYPERLINK(""http://x.pe"",""clic"")"', "'+51 999", "'-borrador", "'@SUMA(A1)", 'Factura 1']);
  });

  it('los números, los vacíos y los objetos no cambian', () => {
    expect(filas(aCsv(['a', 'b', 'c', 'd'], [[-5, null, undefined, { n: 1 }]]))[1]).toBe('-5,,,"{""n"":1}"');
  });
});
