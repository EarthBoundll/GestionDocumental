import { LibroDeExcel, letra, type Celda, type Fila, type Hoja, type Valor } from './libro.js';

/*
 * Las exportaciones en Excel (D44): una hoja «Resumen» con cara de informe (título, tarjetas con los totales y
 * conteos con barras) y los datos en una tabla de Excel con filtros, que es lo que Power BI lista al abrir
 * el libro. Los colores son los del sistema.
 */

const MARCA = '0F766E';
const MARCA_CLARA = 'CCFBF1';
const TINTA = '0F172A';
const GRIS = '64748B';
const LINEA = 'E2E8F0';
const TARJETA = 'F8FAFC';
const BARRA = '5EEAD4';

/** Los colores de cada etiqueta de estado en la hoja de datos: los de la pantalla. */
export const COLORES_DE_ESTADO: Record<string, [texto: string, fondo: string]> = {
  Aprobada: ['15803D', 'DCFCE7'],
  Pendiente: ['B45309', 'FEF3C7'],
  Rechazada: ['BE123C', 'FFE4E6'],
  'Sin solicitud': ['475569', 'F1F5F9'],
  Sí: ['6D28D9', 'EDE9FE'],
};

export interface Tarjeta {
  titulo: string;
  valor: number;
  nota: string;
  /** RRGGBB de la franja. */
  color: string;
}

export interface Seccion {
  titulo: string;
  /** Lo que se cuenta: «Categoría», «Persona»… */
  columna: string;
  filas: [etiqueta: string, cantidad: number][];
}

export interface ColumnaDeDatos {
  titulo: string;
  ancho: number;
  tipo?: 'texto' | 'fecha' | 'fechaHora' | 'entero' | 'decimal' | 'etiqueta';
}

export interface Informe {
  titulo: string;
  empresa: string;
  exportadoPor: string;
  filtros: string;
  tarjetas: Tarjeta[];
  secciones: Seccion[];
  nota: string;
  datos: { nombre: string; columnas: ColumnaDeDatos[]; filas: Valor[][] };
}

/** Cuántas veces aparece cada valor, de más a menos. */
export function contar(valores: string[]): [string, number][] {
  const conteo = new Map<string, number>();
  for (const valor of valores) conteo.set(valor, (conteo.get(valor) ?? 0) + 1);
  return [...conteo].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
}

export const delTotal = (parte: number, total: number) => `${total ? Math.round((parte / total) * 100) : 0} % del total`;

/** Trece columnas: cuatro tarjetas de dos columnas, con márgenes angostos entre ellas y a los lados. */
const ANCHOS_DEL_RESUMEN = [2, 20, 14, 2, 20, 14, 2, 20, 14, 2, 20, 14, 2];
const INICIO_DE_TARJETA = [1, 4, 7, 10];
/** Las secciones van de a dos por renglón: nombre, cantidad y parte del total. */
const COLUMNAS_DE_SECCION = [[1, 2, 4], [7, 8, 10]] as const;

function resumen(libro: LibroDeExcel, informe: Informe): Hoja {
  const e = libro.estilos;
  const ancho = ANCHOS_DEL_RESUMEN.length;
  const filas: Fila[] = [];
  const combinadas: string[] = [];
  const condicionales: string[] = [];
  const vacia = (): (Celda | null)[] => Array.from({ length: ancho }, () => null);
  const agregar = (alto: number, celdas = vacia()) => filas.push({ alto, celdas });
  /** Una línea a todo lo ancho: el texto en la B, combinada hasta la penúltima columna. */
  const aTodoLoAncho = (alto: number, valor: string, estilo: number, conFondo: boolean) => {
    const celdas = vacia().map((_, c) => (conFondo || c === 1 ? { valor: c === 1 ? valor : null, estilo } : null));
    agregar(alto, celdas);
    combinadas.push(`B${filas.length}:${letra(ancho - 2)}${filas.length}`);
  };

  const ahora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'long', timeStyle: 'short' });
  aTodoLoAncho(44, informe.titulo, e.de({ titulo: true, tamano: 22, negrita: true, color: 'FFFFFF', relleno: MARCA }), true);
  aTodoLoAncho(22, `${informe.empresa}  ·  Exportado el ${ahora} por ${informe.exportadoPor}`, e.de({ tamano: 10, color: MARCA_CLARA, relleno: MARCA }), true);
  agregar(10);
  aTodoLoAncho(20, `Filtros: ${informe.filtros}`, e.de({ tamano: 10, color: GRIS }), false);
  agregar(10);

  // Cada tarjeta: el título pequeño, la cifra grande y una nota, con una franja de color a la izquierda.
  const partesDeTarjeta = [
    { alto: 22, texto: (t: Tarjeta) => t.titulo.toUpperCase(), estilo: { tamano: 9, negrita: true, color: GRIS } },
    { alto: 40, texto: (t: Tarjeta) => t.valor, estilo: { titulo: true, tamano: 26, negrita: true, color: TINTA, formato: '#,##0', horizontal: 'left' as const } },
    { alto: 22, texto: (t: Tarjeta) => t.nota, estilo: { tamano: 9, color: GRIS } },
  ];
  for (const parte of partesDeTarjeta) {
    const celdas = vacia();
    informe.tarjetas.forEach((tarjeta, i) => {
      const inicio = INICIO_DE_TARJETA[i]!;
      celdas[inicio] = { valor: parte.texto(tarjeta), estilo: e.de({ ...parte.estilo, relleno: TARJETA, bordeIzquierdo: tarjeta.color, sangria: 1 }) };
      celdas[inicio + 1] = { valor: null, estilo: e.de({ relleno: TARJETA }) };
      combinadas.push(`${letra(inicio)}${filas.length + 1}:${letra(inicio + 1)}${filas.length + 1}`);
    });
    agregar(parte.alto, celdas);
  }

  const tituloDeSeccion = e.de({ titulo: true, tamano: 13, negrita: true, color: MARCA, bordeInferior: LINEA });
  const subrayado = e.de({ bordeInferior: LINEA });
  const encabezado = e.de({ tamano: 9, negrita: true, color: GRIS, bordeInferior: LINEA });
  const encabezadoDeNumero = e.de({ tamano: 9, negrita: true, color: GRIS, bordeInferior: LINEA, horizontal: 'right' });
  const etiqueta = e.de({ color: TINTA });
  const cantidad = e.de({ negrita: true, color: TINTA, formato: '#,##0' });
  const parteDelTotal = e.de({ color: GRIS, formato: '0%', horizontal: 'right' });
  let prioridad = 1;
  for (let s = 0; s < informe.secciones.length; s += 2) {
    const pares = informe.secciones.slice(s, s + 2);
    agregar(14);
    const titulos = vacia();
    const encabezados = vacia();
    pares.forEach((seccion, i) => {
      const [a, b, c] = COLUMNAS_DE_SECCION[i]!;
      for (let col = a; col <= c + 1; col++) titulos[col] = { valor: null, estilo: subrayado };
      titulos[a] = { valor: seccion.titulo, estilo: tituloDeSeccion };
      encabezados[a] = { valor: seccion.columna, estilo: encabezado };
      encabezados[b] = { valor: 'Cantidad', estilo: encabezadoDeNumero };
      encabezados[b + 1] = { valor: null, estilo: encabezado };
      encabezados[c] = { valor: 'Del total', estilo: encabezadoDeNumero };
      encabezados[c + 1] = { valor: null, estilo: encabezado };
    });
    agregar(28, titulos);
    agregar(20, encabezados);
    const primera = filas.length + 1;
    const largo = Math.max(...pares.map((seccion) => seccion.filas.length));
    for (let r = 0; r < largo; r++) {
      const celdas = vacia();
      pares.forEach((seccion, i) => {
        const [a, b, c] = COLUMNAS_DE_SECCION[i]!;
        const valor = seccion.filas[r];
        if (!valor) return;
        const total = seccion.filas.reduce((suma, [, n]) => suma + n, 0);
        celdas[a] = { valor: valor[0], estilo: etiqueta };
        celdas[b] = { valor: valor[1], estilo: cantidad };
        celdas[c] = { valor: total ? valor[1] / total : 0, estilo: parteDelTotal };
      });
      agregar(20, celdas);
    }
    // Una barra en cada cantidad, desde cero: se ve de un vistazo qué pesa más.
    pares.forEach((seccion, i) => {
      if (!seccion.filas.length) return;
      const columna = letra(COLUMNAS_DE_SECCION[i]![1]);
      condicionales.push(`<conditionalFormatting sqref="${columna}${primera}:${columna}${primera + seccion.filas.length - 1}"><cfRule type="dataBar" priority="${prioridad++}">`
        + `<dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="FF${BARRA}"/></dataBar></cfRule></conditionalFormatting>`);
    });
  }
  agregar(16);
  aTodoLoAncho(34, informe.nota, e.de({ tamano: 9, color: GRIS }), false);
  return { nombre: 'Resumen', filas, anchos: ANCHOS_DEL_RESUMEN, combinadas, condicionales, sinCuadricula: true };
}

function datos(libro: LibroDeExcel, { nombre, columnas, filas }: Informe['datos']): Hoja {
  const e = libro.estilos;
  const porTipo = {
    texto: e.de(),
    fecha: e.de({ formato: 'dd/mm/yyyy', horizontal: 'left' }),
    fechaHora: e.de({ formato: 'dd/mm/yyyy hh:mm', horizontal: 'left' }),
    entero: e.de({ formato: '#,##0', horizontal: 'center' }),
    decimal: e.de({ formato: '#,##0.0' }),
    etiqueta: e.de({ horizontal: 'center' }),
  };
  const encabezado = e.de({ negrita: true });
  const condicionales: string[] = [];
  let prioridad = 1;
  columnas.forEach((columna, c) => {
    if (columna.tipo !== 'etiqueta' || !filas.length) return;
    const rango = `${letra(c)}2:${letra(c)}${filas.length + 1}`;
    const reglas = Object.entries(COLORES_DE_ESTADO).map(([valor, [texto, fondo]]) =>
      `<cfRule type="cellIs" dxfId="${e.condicional(texto, fondo)}" priority="${prioridad++}" operator="equal"><formula>"${valor}"</formula></cfRule>`);
    condicionales.push(`<conditionalFormatting sqref="${rango}">${reglas.join('')}</conditionalFormatting>`);
  });
  return {
    nombre,
    anchos: columnas.map((columna) => columna.ancho),
    filas: [
      { alto: 26, celdas: columnas.map((columna) => ({ valor: columna.titulo, estilo: encabezado })) },
      ...filas.map((fila) => ({
        alto: 20,
        celdas: columnas.map((columna, c) => ({
          valor: fila[c] ?? null,
          estilo: porTipo[columna.tipo ?? 'texto'],
          esFecha: columna.tipo === 'fecha' || columna.tipo === 'fechaHora',
        })),
      })),
    ],
    tabla: { nombre, fila: 1, columnas: columnas.length },
    condicionales,
    fijas: 1,
    sinCuadricula: true,
  };
}

export function informeEnExcel(informe: Informe): Buffer {
  const libro = new LibroDeExcel();
  libro.agregar(resumen(libro, informe));
  libro.agregar(datos(libro, informe.datos));
  return libro.aBuffer({ titulo: informe.titulo, autor: informe.exportadoPor });
}
