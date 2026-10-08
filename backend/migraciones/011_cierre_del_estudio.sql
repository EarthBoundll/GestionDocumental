-- 011 · Constancia del cierre del estudio (D33).
--
-- Al cerrar el estudio, el investigador elimina los datos de la empresa evaluada (docs/09 §10, Ley 29733).
-- Lo hace un procedimiento del dueño de la base (npm run cierre-del-estudio), no la aplicación: el
-- historial es inalterable para ella (RN17). Lo único que queda es esta constancia, sin datos personales,
-- en el historial de la plataforma: sin empresa, para que la auditoría del Master la vea (D24).
alter table historial drop constraint historial_accion_del_catalogo;
alter table historial add constraint historial_accion_del_catalogo check (accion in (
  'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA',
  'CLAVE_RESTABLECIDA', 'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA',
  'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
  'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO',
  'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA',
  'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO',
  'DOCUMENTO_RESTAURADO', 'DOCUMENTO_PURGADO', 'RESPALDO_GENERADO', 'VERSION_SUBIDA', 'VERSION_RESTAURADA',
  'LISTADO_EXPORTADO', 'EMPRESA_ELIMINADA'
));
