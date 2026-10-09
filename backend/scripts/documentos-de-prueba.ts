/*
 * Documentos de prueba con datos ficticios (D34): para el piloto, la capacitación y la demostración de la
 * sustentación, sin usar nunca documentos reales de una empresa (docs/09 §3). Siempre genera el mismo
 * juego, así que dos personas que lo generan tienen los mismos archivos.
 *
 *   npm run documentos-de-prueba -- <carpeta> [--cantidad 40]
 *       escribe los PDF y un manifiesto.csv con el nombre, la categoría y la fecha sugeridos de cada uno.
 *   npm run documentos-de-prueba -- <carpeta> --subir
 *       además los sube por la API, como lo haría una persona, a la empresa de la cuenta indicada en el
 *       .env (CARGA_API_URL, CARGA_EMAIL y CARGA_CLAVE). Crea las categorías que falten si es administradora.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { aCsv } from '../src/compartido/csv.js';
import { pdfDeTexto, type Linea } from './pdf-de-texto.js';

export interface DocumentoDePrueba {
  archivo: string;
  nombre: string;
  categoria: string;
  fecha: string;
  contenido: Buffer;
}

const CLIENTES = ['Boutique Lucero (ficticia)', 'Distribuidora Norte de Prueba', 'Comercial Ejemplo Gamarra',
  'Tienda Demostración Sur', 'Moda Simulada Miraflores', 'Uniformes de Muestra SAC'];
const PRENDAS = [['Polo de algodón pima', 28], ['Pantalón drill', 45], ['Casaca polar', 62], ['Chompa de alpaca', 95],
  ['Uniforme escolar', 80], ['Tela jersey (kg)', 24], ['Hilo poliéster (cono)', 9]] as const;

/** El tipo de documento manda la categoría: las iniciales de toda empresa y dos propias de un taller. */
const TIPOS = [
  { tipo: 'Factura', categoria: 'Facturas y boletas', serie: 'F001', comercial: true },
  { tipo: 'Boleta de venta', categoria: 'Facturas y boletas', serie: 'B001', comercial: true },
  { tipo: 'Guía de remisión', categoria: 'Guías de remisión', serie: 'T001', comercial: true },
  { tipo: 'Orden de compra', categoria: 'Órdenes de compra', serie: 'OC', comercial: true },
  { tipo: 'Cotización', categoria: 'Cotizaciones', serie: 'COT', comercial: true },
  { tipo: 'Contrato de servicio', categoria: 'Contratos', serie: 'CT', comercial: false },
  { tipo: 'Constancia de trabajo', categoria: 'Recursos humanos', serie: 'RH', comercial: false },
  { tipo: 'Acta de reunión', categoria: 'Otros', serie: 'AC', comercial: false },
] as const;

/**
 * Un generador con semilla (mulberry32): el mismo juego cada vez, sin depender de Math.random. Opera en
 * 32 bits con Math.imul; una multiplicación en números de JavaScript pasaría de 2^53, perdería los bits
 * bajos y repetiría casi siempre los mismos valores.
 */
function aleatorio(semilla: number) {
  let estado = semilla >>> 0;
  return (maximo: number) => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = Math.imul(estado ^ (estado >>> 15), estado | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4_294_967_296 * maximo) | 0;
  };
}

const soles = (monto: number) => `S/ ${monto.toFixed(2)}`;

function cuerpo(tipo: (typeof TIPOS)[number], numero: string, fecha: string, cliente: string, azar: (n: number) => number): Linea[] {
  const lineas: Linea[] = [
    { texto: 'DOCUMENTO DE PRUEBA - DATOS FICTICIOS', estilo: 'nota' },
    { texto: `${tipo.tipo} ${numero}`, estilo: 'titulo' },
    { texto: 'Taller de confecciones de prueba (empresa ficticia)', estilo: 'negrita' },
    { texto: `Fecha: ${fecha.split('-').reverse().join('/')}` },
  ];
  if (tipo.comercial) {
    lineas.push({ texto: `Cliente: ${cliente}` }, { texto: '' }, { texto: 'Detalle', estilo: 'negrita' });
    let subtotal = 0;
    for (let i = 0; i <= azar(3); i++) {
      const [prenda, precio] = PRENDAS[azar(PRENDAS.length)]!;
      const cantidad = 5 + azar(60);
      subtotal += cantidad * precio;
      lineas.push({ texto: `${cantidad} x ${prenda} a ${soles(precio)} = ${soles(cantidad * precio)}` });
    }
    lineas.push({ texto: '' }, { texto: `Subtotal: ${soles(subtotal)}` }, { texto: `IGV (18 %): ${soles(subtotal * 0.18)}` },
      { texto: `Total: ${soles(subtotal * 1.18)}`, estilo: 'negrita' });
  } else if (tipo.tipo === 'Contrato de servicio') {
    lineas.push({ texto: `Entre el taller y ${cliente}, para la confección de prendas por temporada.` },
      { texto: `Plazo: ${3 + azar(10)} meses. Las condiciones son de ejemplo y no obligan a nadie.` });
  } else if (tipo.tipo === 'Constancia de trabajo') {
    lineas.push({ texto: `Se deja constancia de que el colaborador C-${String(1 + azar(40)).padStart(2, '0')} trabaja en el área de costura.` },
      { texto: 'Persona ficticia: el código no corresponde a nadie.' });
  } else {
    lineas.push({ texto: `Asistentes: colaboradores C-0${1 + azar(9)} y C-1${azar(9)} (ficticios).` },
      { texto: 'Acuerdos: revisar el avance del pedido y ordenar el almacén de telas.' });
  }
  lineas.push({ texto: '' }, { texto: 'Generado para probar el sistema de gestión documental. Ningún dato es real.', estilo: 'nota' });
  return lineas;
}

export function generarDocumentos(cantidad = 40, semilla = 2026): DocumentoDePrueba[] {
  const azar = aleatorio(semilla);
  return Array.from({ length: cantidad }, (_, indice) => {
    const tipo = TIPOS[indice % TIPOS.length]!;
    const numero = `${tipo.serie}-${String(100 + indice * 7 + azar(7)).padStart(6, '0')}`;
    const fecha = new Date(Date.UTC(2025, 0, 1) + (indice * 11 + azar(11)) * 86_400_000).toISOString().slice(0, 10);
    const cliente = CLIENTES[azar(CLIENTES.length)]!;
    const nombre = tipo.comercial ? `${tipo.tipo} ${numero} - ${cliente.replace(' (ficticia)', '')}` : `${tipo.tipo} ${numero}`;
    const archivo = `${String(indice + 1).padStart(2, '0')}-${numero.toLowerCase()}.pdf`;
    return { archivo, nombre, categoria: tipo.categoria, fecha, contenido: pdfDeTexto(cuerpo(tipo, numero, fecha, cliente, azar)) };
  });
}

/**
 * Sube el juego por la API, como una persona más: inicia sesión, crea las categorías que falten (si no
 * puede, usa «Otros») y sube cada documento. Nunca imprime el token.
 */
export async function subirDocumentos(
  documentos: DocumentoDePrueba[],
  { api, email, clave, avisar = console.log }: { api: string; email: string; clave: string; avisar?: (texto: string) => void },
): Promise<void> {
  const base = `${api.replace(/\/$/, '')}/api/v1`;
  const pedir = async <T = unknown>(ruta: string, opciones: RequestInit = {}): Promise<T> => {
    const respuesta = await fetch(`${base}${ruta}`, opciones);
    if (!respuesta.ok) throw new Error(`${opciones.method ?? 'GET'} ${ruta}: ${respuesta.status} ${await respuesta.text()}`);
    return (respuesta.status === 204 ? null : await respuesta.json()) as T;
  };
  const { token } = await pedir<{ token: string }>('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, clave }),
  });
  const autorizacion = { Authorization: `Bearer ${token}` };
  try {
    const { datos } = await pedir<{ datos: { id: string; nombre: string }[] }>('/categorias', { headers: autorizacion });
    const categorias = new Map(datos.map((categoria) => [categoria.nombre, categoria.id]));
    const otros = categorias.get('Otros');
    for (const nombre of new Set(documentos.map((documento) => documento.categoria))) {
      if (categorias.has(nombre)) continue;
      const creada = await pedir<{ id: string }>('/categorias', {
        method: 'POST', headers: { ...autorizacion, 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre }),
      }).catch(() => null);
      const destino = creada?.id ?? otros;
      // Se comprueba antes de subir nada: mejor no empezar que dejar medio juego cargado.
      if (!destino) throw new Error(`No se pudo crear la categoría «${nombre}» y la empresa no tiene «Otros» activa`);
      categorias.set(nombre, destino);
    }
    for (const [indice, documento] of documentos.entries()) {
      const formulario = new FormData();
      formulario.append('nombre', documento.nombre);
      formulario.append('categoriaId', categorias.get(documento.categoria)!);
      formulario.append('fechaDocumento', documento.fecha);
      formulario.append('archivo', new Blob([documento.contenido], { type: 'application/pdf' }), documento.archivo);
      await pedir('/documentos', { method: 'POST', headers: autorizacion, body: formulario });
      avisar(`Subido ${indice + 1} de ${documentos.length}: ${documento.nombre}`);
    }
  } finally {
    await pedir('/auth/logout', { method: 'POST', headers: autorizacion }).catch(() => {});
  }
}

// Solo al ejecutarlo, no al importarlo en las pruebas. pathToFileURL: en Windows o con espacios, la ruta no es la URL.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { positionals: [carpeta], values } = parseArgs({
    allowPositionals: true,
    options: { cantidad: { type: 'string', default: '40' }, subir: { type: 'boolean', default: false } },
  });
  try {
    if (!carpeta) throw new Error('Uso: npm run documentos-de-prueba -- <carpeta> [--cantidad 40] [--subir]');
    const documentos = generarDocumentos(Number(values.cantidad));
    await mkdir(carpeta, { recursive: true });
    for (const documento of documentos) await writeFile(join(carpeta, documento.archivo), documento.contenido);
    await writeFile(join(carpeta, 'manifiesto.csv'),
      aCsv(['archivo', 'nombre', 'categoria', 'fecha'], documentos.map((d) => [d.archivo, d.nombre, d.categoria, d.fecha])));
    console.log(`${documentos.length} documentos ficticios en ${carpeta}, con su manifiesto.csv`);
    if (values.subir) {
      const [api, email, clave] = [process.env.CARGA_API_URL, process.env.CARGA_EMAIL, process.env.CARGA_CLAVE];
      if (!api || !email || !clave) throw new Error('Para subir, define CARGA_API_URL, CARGA_EMAIL y CARGA_CLAVE en el .env');
      await subirDocumentos(documentos, { api, email, clave });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
