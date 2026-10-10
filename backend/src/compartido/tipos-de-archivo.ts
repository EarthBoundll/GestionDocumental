import { ErrorAplicacion } from './errores.js';

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OFFICE_ANTIGUO = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Los tipos admitidos (RN09). La extensión dice qué dice ser el archivo; los primeros bytes, qué es.
 * Se exigen ambos, para que un ejecutable renombrado como «factura.pdf» no entre en el sistema.
 */
const TIPOS = {
  pdf: { mime: 'application/pdf', firma: [0x25, 0x50, 0x44, 0x46] },
  jpg: { mime: 'image/jpeg', firma: [0xff, 0xd8, 0xff] },
  jpeg: { mime: 'image/jpeg', firma: [0xff, 0xd8, 0xff] },
  png: { mime: 'image/png', firma: [0x89, 0x50, 0x4e, 0x47] },
  doc: { mime: 'application/msword', firma: OFFICE_ANTIGUO },
  xls: { mime: 'application/vnd.ms-excel', firma: OFFICE_ANTIGUO },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', firma: ZIP },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', firma: ZIP },
} as const satisfies Record<string, { mime: string; firma: readonly number[] }>;

export const EXTENSIONES_ADMITIDAS = Object.keys(TIPOS);

/** Cómo filtra por tipo quien busca (D42): por lo que el archivo es para una persona, no por su extensión. */
export const GRUPOS_DE_TIPO = {
  pdf: [TIPOS.pdf.mime],
  imagen: [TIPOS.jpg.mime, TIPOS.png.mime],
  word: [TIPOS.doc.mime, TIPOS.docx.mime],
  excel: [TIPOS.xls.mime, TIPOS.xlsx.mime],
} as const satisfies Record<string, readonly string[]>;
export type GrupoDeTipo = keyof typeof GRUPOS_DE_TIPO;

/** El nombre corto de un tipo admitido («PDF», «DOCX»), para lo que lee una persona: el listado documental. */
export function nombreDeTipo(mime: string): string {
  const extension = Object.entries(TIPOS).find(([, tipo]) => tipo.mime === mime)?.[0];
  return extension ? extension.toUpperCase() : mime;
}

export function identificarTipo(nombreOriginal: string, contenido: Buffer): { extension: string; mime: string } {
  const extension = /\.([a-z0-9]+)$/i.exec(nombreOriginal)?.[1]?.toLowerCase() ?? '';
  const tipo = Object.hasOwn(TIPOS, extension) ? TIPOS[extension as keyof typeof TIPOS] : undefined;
  if (!tipo || !tipo.firma.every((byte, posicion) => contenido[posicion] === byte)) {
    throw new ErrorAplicacion(415, 'TIPO_NO_PERMITIDO', `Solo se admiten archivos ${EXTENSIONES_ADMITIDAS.join(', ').toUpperCase()}`);
  }
  return { extension, mime: tipo.mime };
}
