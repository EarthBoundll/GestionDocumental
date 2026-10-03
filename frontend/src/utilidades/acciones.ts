import { contar, formatearFecha } from './formato';

/** Cómo se lee cada acción del historial (docs/01-analisis.md §7). */
export const NOMBRES_DE_ACCIONES: Record<string, string> = {
  SESION_INICIADA: 'Inicio de sesión',
  SESION_FALLIDA: 'Inicio de sesión fallido',
  SESION_CERRADA: 'Cierre de sesión',
  CLAVE_CAMBIADA: 'Contraseña cambiada',
  RECUPERACION_SOLICITADA: 'Recuperación de contraseña solicitada',
  CLAVE_RESTABLECIDA: 'Contraseña restablecida por correo',
  EMPRESA_CREADA: 'Empresa registrada',
  EMPRESA_EDITADA: 'Datos de la empresa editados',
  EMPRESA_DESACTIVADA: 'Empresa desactivada',
  EMPRESA_REACTIVADA: 'Empresa reactivada',
  USUARIO_CREADO: 'Usuario creado',
  USUARIO_EDITADO: 'Usuario editado',
  USUARIO_DESACTIVADO: 'Usuario desactivado',
  USUARIO_REACTIVADO: 'Usuario reactivado',
  CATEGORIA_CREADA: 'Categoría creada',
  CATEGORIA_EDITADA: 'Categoría editada',
  DOCUMENTO_SUBIDO: 'Documento subido',
  DOCUMENTO_EDITADO: 'Documento editado',
  DOCUMENTO_ELIMINADO: 'Documento eliminado',
  DOCUMENTO_VISUALIZADO: 'Documento visto',
  DOCUMENTO_DESCARGADO: 'Documento descargado',
  BUSQUEDA_REALIZADA: 'Búsqueda',
  SOLICITUD_CREADA: 'Aprobación solicitada',
  SOLICITUD_APROBADA: 'Solicitud aprobada',
  SOLICITUD_RECHAZADA: 'Solicitud rechazada',
  ACCESO_DENEGADO: 'Acceso denegado',
  HISTORIAL_EXPORTADO: 'Historial exportado',
};

/** Los campos que aparecen en «cambios», como los entiende quien lee el historial. */
const NOMBRES_DE_CAMPOS: Record<string, string> = {
  nombre: 'nombre',
  descripcion: 'descripción',
  categoriaId: 'categoría',
  fechaDocumento: 'fecha',
  activa: 'estado',
  activo: 'estado',
  rol: 'rol',
  dni: 'DNI',
  clave: 'contraseña',
  email: 'correo',
  ruc: 'RUC',
};

const legible = (codigo: string) => codigo.toLowerCase().replaceAll('_', ' ');

/** Lo esencial del detalle de un asiento, en frases cortas: qué documento, qué buscó, qué cambió… */
export function resumirDetalle(detalle: Record<string, unknown>): string[] {
  const partes: string[] = [];
  if (typeof detalle.nombre === 'string') partes.push(`«${detalle.nombre}»`);
  if (typeof detalle.documento === 'string') partes.push(`«${detalle.documento}»`);
  if (typeof detalle.categoria === 'string') partes.push(`en ${detalle.categoria}`);
  if (detalle.filtros && typeof detalle.filtros === 'object') {
    const { q, categoriaId, desde, hasta } = detalle.filtros as Record<string, string | undefined>;
    if (q) partes.push(`buscó «${q}»`);
    if (categoriaId) partes.push('por categoría');
    if (desde && hasta) partes.push(`del ${formatearFecha(desde)} al ${formatearFecha(hasta)}`);
    else if (desde) partes.push(`desde el ${formatearFecha(desde)}`);
    else if (hasta) partes.push(`hasta el ${formatearFecha(hasta)}`);
  }
  if (typeof detalle.resultados === 'number') partes.push(contar(detalle.resultados, 'resultado'));
  if (typeof detalle.filas === 'number') partes.push(contar(detalle.filas, 'fila exportada', 'filas exportadas'));
  if (typeof detalle.comentario === 'string' && detalle.comentario) partes.push(`comentario: «${detalle.comentario}»`);
  if (detalle.cambios && typeof detalle.cambios === 'object') {
    const campos = Object.keys(detalle.cambios).map((campo) => NOMBRES_DE_CAMPOS[campo] ?? campo);
    if (campos.length > 0) partes.push(`cambió ${campos.join(', ')}`);
  }
  if (typeof detalle.permiso === 'string') partes.push(`exigía ${legible(detalle.permiso)}${typeof detalle.ruta === 'string' ? ` en ${detalle.ruta}` : ''}`);
  if (typeof detalle.motivo === 'string') partes.push(legible(detalle.motivo));
  if (detalle.enviada === true) partes.push('enlace enviado');
  if (typeof detalle.sesionesCerradas === 'number' && detalle.sesionesCerradas > 0) {
    partes.push(contar(detalle.sesionesCerradas, 'sesión cerrada', 'sesiones cerradas'));
  }
  return partes;
}
