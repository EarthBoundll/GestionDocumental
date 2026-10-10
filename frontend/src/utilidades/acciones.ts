import { ESTADOS_DE_APROBACION, TIPOS_DE_ARCHIVO } from './busqueda';
import { contar, formatearFecha, formatearPeso } from './formato';

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
  DOCUMENTO_RESTAURADO: 'Documento restaurado',
  DOCUMENTO_PURGADO: 'Documento eliminado para siempre',
  RESPALDO_GENERADO: 'Respaldo de la base generado',
  VERSION_SUBIDA: 'Versión nueva subida',
  VERSION_RESTAURADA: 'Versión anterior restaurada',
  LISTADO_EXPORTADO: 'Listado documental exportado',
  EMPRESA_ELIMINADA: 'Datos de una empresa eliminados',
  INVITACION_ENVIADA: 'Invitación enviada',
  VERIFICACION_ENVIADA: 'Enlace para confirmar el correo enviado',
  CORREO_VERIFICADO: 'Correo verificado',
};

/** Los campos que aparecen en «cambios», como los entiende quien lee el historial. */
const NOMBRES_DE_CAMPOS: Record<string, string> = {
  nombre: 'nombre',
  descripcion: 'descripción',
  categoriaId: 'categoría',
  fechaDocumento: 'fecha',
  activa: 'estado',
  activo: 'estado',
  restringida: 'restricción',
  rol: 'rol',
  dni: 'DNI',
  clave: 'contraseña',
  email: 'correo',
  ruc: 'RUC',
  nombreComercial: 'nombre comercial',
  colorPrimario: 'color',
  colorFondo: 'color de fondo',
  logo: 'logo',
  fondo: 'imagen de fondo',
};

const legible = (codigo: string) => codigo.toLowerCase().replaceAll('_', ' ');

/** «cambió nombre, categoría», si el asiento trae cambios. */
function camposCambiados(detalle: Record<string, unknown>): string | null {
  if (!detalle.cambios || typeof detalle.cambios !== 'object') return null;
  const campos = Object.keys(detalle.cambios).map((campo) => NOMBRES_DE_CAMPOS[campo] ?? campo);
  return campos.length > 0 ? `cambió ${campos.join(', ')}` : null;
}

/** Lo esencial del detalle de un asiento, en frases cortas: qué documento, qué buscó, qué cambió… */
export function resumirDetalle(detalle: Record<string, unknown>): string[] {
  const partes: string[] = [];
  if (typeof detalle.nombre === 'string') partes.push(`«${detalle.nombre}»`);
  if (typeof detalle.documento === 'string') partes.push(`«${detalle.documento}»`);
  if (typeof detalle.categoria === 'string') partes.push(`en ${detalle.categoria}`);
  if (typeof detalle.version === 'number') {
    partes.push(typeof detalle.desde === 'number' ? `versión ${detalle.desde} restaurada como ${detalle.version}` : `versión ${detalle.version}`);
  }
  if (detalle.filtros && typeof detalle.filtros === 'object') {
    const { q, categoriaId, desde, hasta, tipo, estado, subidoPor, fechaDe } = detalle.filtros as Record<string, string | undefined>;
    if (q) partes.push(`buscó «${q}»`);
    if (categoriaId) partes.push('por categoría');
    // D42: los filtros que se sumaron a la búsqueda.
    if (tipo) partes.push(`tipo ${TIPOS_DE_ARCHIVO.find((opcion) => opcion.valor === tipo)?.texto ?? tipo}`);
    if (estado) partes.push((ESTADOS_DE_APROBACION.find((opcion) => opcion.valor === estado)?.texto ?? estado).toLowerCase());
    if (subidoPor) partes.push('por quién lo subió');
    const subida = fechaDe === 'subida' ? ' (subida)' : '';
    if (desde && hasta) partes.push(`del ${formatearFecha(desde)} al ${formatearFecha(hasta)}${subida}`);
    else if (desde) partes.push(`desde el ${formatearFecha(desde)}${subida}`);
    else if (hasta) partes.push(`hasta el ${formatearFecha(hasta)}${subida}`);
  }
  if (typeof detalle.resultados === 'number') partes.push(contar(detalle.resultados, 'resultado'));
  if (detalle.origen === 'sugerencia') partes.push('elegido de las sugerencias');
  if (detalle.aproximada === true) partes.push('solo parecidos');
  if (typeof detalle.archivo === 'string' && typeof detalle.bytes === 'number') partes.push(formatearPeso(detalle.bytes));
  if (typeof detalle.filas === 'number') {
    partes.push(detalle.formato === 'impresion'
      ? contar(detalle.filas, 'fila para imprimir', 'filas para imprimir')
      : contar(detalle.filas, 'fila exportada', 'filas exportadas'));
  }
  if (typeof detalle.comentario === 'string' && detalle.comentario) partes.push(`comentario: «${detalle.comentario}»`);
  const cambio = camposCambiados(detalle);
  if (cambio) partes.push(cambio);
  if (detalle.restringida === true) partes.push('restringida');
  if (Array.isArray(detalle.autorizados) && detalle.autorizados.length > 0) partes.push(`para ${detalle.autorizados.join(', ')}`);
  if (detalle.accesos && typeof detalle.accesos === 'object') {
    const { anadidos = [], quitados = [] } = detalle.accesos as { anadidos?: string[]; quitados?: string[] };
    if (anadidos.length > 0) partes.push(`dio acceso a ${anadidos.join(', ')}`);
    if (quitados.length > 0) partes.push(`quitó acceso a ${quitados.join(', ')}`);
  }
  if (typeof detalle.permiso === 'string') {
    const ruta = typeof detalle.ruta === 'string' ? ` en ${detalle.ruta.replace(/^\/api\/v1/, '')}` : '';
    partes.push(`exigía ${legible(detalle.permiso)}${ruta}`);
  }
  if (typeof detalle.motivo === 'string') partes.push(legible(detalle.motivo));
  // El cierre del estudio (D33): cuánto se borró, sin nombrar a la empresa ni a su gente.
  if (detalle.filasBorradas && typeof detalle.filasBorradas === 'object') {
    const total = Object.values(detalle.filasBorradas as Record<string, number>).reduce((suma, n) => suma + n, 0);
    partes.push(contar(total, 'fila borrada', 'filas borradas'));
  }
  if (typeof detalle.archivosBorrados === 'number') partes.push(contar(detalle.archivosBorrados, 'archivo borrado', 'archivos borrados'));
  if (detalle.enviada === true) partes.push(detalle.enlace === 'invitacion' ? 'invitación reenviada' : 'enlace enviado');
  // D41: cómo quedó probado el correo.
  if (detalle.mediante === 'invitacion') partes.push('al aceptar su invitación');
  if (detalle.mediante === 'enlace') partes.push('con el enlace del correo');
  if (detalle.correoVerificado === true) partes.push('correo verificado');
  if (typeof detalle.sesionesCerradas === 'number' && detalle.sesionesCerradas > 0) {
    partes.push(contar(detalle.sesionesCerradas, 'sesión cerrada', 'sesiones cerradas'));
  }
  return partes;
}

/** Cómo se cuenta cada paso en la línea de tiempo de un documento: «Ana lo aprobó». */
const FRASES_DE_ACTIVIDAD: Record<string, string> = {
  DOCUMENTO_SUBIDO: 'subió el documento',
  DOCUMENTO_EDITADO: 'lo editó',
  DOCUMENTO_ELIMINADO: 'lo eliminó',
  DOCUMENTO_RESTAURADO: 'lo restauró de la papelera',
  SOLICITUD_CREADA: 'pidió aprobarlo',
  SOLICITUD_APROBADA: 'lo aprobó',
  SOLICITUD_RECHAZADA: 'lo rechazó',
  DOCUMENTO_VISUALIZADO: 'lo vio',
  DOCUMENTO_DESCARGADO: 'lo descargó',
};

/** Qué intentó quien no podía, según la operación que registró la API. */
const INTENTOS_DENEGADOS: Record<string, string> = {
  EDITAR_DOCUMENTO: 'intentó editarlo sin permiso',
  SUBIR_VERSION: 'intentó subir una versión sin permiso',
  RESTAURAR_VERSION: 'intentó restaurar una versión sin permiso',
  ELIMINAR_DOCUMENTO: 'intentó eliminarlo sin permiso',
  SOLICITAR_APROBACION: 'intentó pedir su aprobación sin ser el autor',
  RESOLVER_SOLICITUD: 'intentó resolver su propia solicitud',
};

export function fraseDeActividad(accion: string, detalle: Record<string, unknown>): string {
  // Las versiones dicen cuál: «subió la versión 3», «restauró la versión 1 como versión 4».
  if (accion === 'VERSION_SUBIDA') return `subió la versión ${String(detalle.version)}`;
  if (accion === 'VERSION_RESTAURADA') return `restauró la versión ${String(detalle.desde)} como versión ${String(detalle.version)}`;
  if (accion === 'ACCESO_DENEGADO') {
    return INTENTOS_DENEGADOS[String(detalle.operacion)] ?? 'intentó una acción sin permiso';
  }
  return FRASES_DE_ACTIVIDAD[accion] ?? (NOMBRES_DE_ACCIONES[accion] ?? accion).toLowerCase();
}

/** Lo que añade cada paso, sin repetir el nombre del documento: qué cambió y con qué comentario. */
export function detalleDeActividad(detalle: Record<string, unknown>): string | null {
  const partes: string[] = [];
  const cambio = camposCambiados(detalle);
  if (cambio) partes.push(cambio);
  // De una versión subida, el archivo: es lo que la distingue de la anterior.
  if (typeof detalle.archivo === 'string' && typeof detalle.version === 'number') partes.push(detalle.archivo);
  if (typeof detalle.comentario === 'string' && detalle.comentario) partes.push(`«${detalle.comentario}»`);
  return partes.length > 0 ? partes.join(' · ') : null;
}
