/**
 * Un PDF de una página con texto, sin dependencias: lo justo para los documentos de prueba (D34). Usa las
 * fuentes que trae todo lector (Helvetica) con la codificación WinAnsi, que cubre las tildes, la ñ, «» y °.
 */
export interface Linea {
  texto: string;
  estilo?: 'titulo' | 'negrita' | 'normal' | 'nota';
}

const ESTILOS = {
  titulo: { fuente: 'F2', tamano: 16, interlineado: 24 },
  negrita: { fuente: 'F2', tamano: 10, interlineado: 15 },
  normal: { fuente: 'F1', tamano: 10, interlineado: 15 },
  nota: { fuente: 'F1', tamano: 8, interlineado: 12 },
} as const;

/** Lo que WinAnsi no tiene se cambia por su equivalente, y en el texto de un PDF se escapan \ ( y ). */
function textoPdf(texto: string): string {
  const latino = texto.replaceAll('—', '-').replaceAll('–', '-').replaceAll('…', '...').replace(/[^\x20-\xff]/g, '?');
  return latino.replace(/[\\()]/g, (caracter) => `\\${caracter}`);
}

export function pdfDeTexto(lineas: Linea[]): Buffer {
  // Cada línea baja según su propio interlineado antes de escribirse: un título no pisa la línea de arriba.
  let y = 806;
  const contenido = lineas.map(({ texto, estilo = 'normal' }) => {
    const { fuente, tamano, interlineado } = ESTILOS[estilo];
    y -= interlineado;
    return `BT /${fuente} ${tamano} Tf 56 ${y} Td (${textoPdf(texto)}) Tj ET`;
  }).join('\n');
  const flujo = Buffer.from(contenido, 'latin1');

  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    null, // el contenido, con su longitud en bytes
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  // La cabecera binaria (cuatro bytes por encima de 127) le dice a quien transfiere el archivo que no es texto.
  const partes: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const posiciones: number[] = [];
  const largo = () => partes.reduce((total, parte) => total + parte.length, 0);
  objetos.forEach((objeto, indice) => {
    posiciones.push(largo());
    const numero = indice + 1;
    partes.push(objeto === null
      ? Buffer.concat([Buffer.from(`${numero} 0 obj\n<< /Length ${flujo.length} >>\nstream\n`, 'latin1'), flujo, Buffer.from('\nendstream\nendobj\n')])
      : Buffer.from(`${numero} 0 obj\n${objeto}\nendobj\n`, 'latin1'));
  });

  // Cada entrada de la tabla de referencias ocupa exactamente 20 bytes.
  const inicioDeLaTabla = largo();
  const tabla = ['xref', `0 ${objetos.length + 1}`, '0000000000 65535 f ',
    ...posiciones.map((posicion) => `${String(posicion).padStart(10, '0')} 00000 n `)].join('\n');
  partes.push(Buffer.from(`${tabla}\ntrailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioDeLaTabla}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(partes);
}
