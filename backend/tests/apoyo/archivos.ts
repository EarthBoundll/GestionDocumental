// Archivos de muestra con la cabecera real de cada formato: el sistema mira los primeros bytes.

export const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('1 0 obj << /Type /Catalog >> endobj\n%%EOF\n')]);
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
export const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
/** Un ejecutable de Windows (empieza por «MZ») con nombre de PDF. */
export const EJECUTABLE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
