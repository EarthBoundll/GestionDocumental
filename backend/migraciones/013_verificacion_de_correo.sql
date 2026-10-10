-- 013 · Verificación del correo por invitación (D41).
--
-- Una cuenta nueva nace pendiente y sin contraseña: no puede entrar hasta que su dueño abre la invitación
-- que le llega por correo, define su contraseña y, con eso, demuestra que el buzón es suyo. Ni el
-- administrador de la empresa ni el Master pueden marcar un correo como verificado: solo la capa de
-- identidad, al gastar un enlace válido, que corre con el dueño de las tablas.

alter table usuarios
  add column email_verificado_en timestamptz,
  -- Nula mientras la invitación no se acepta: sin contraseña no hay forma de iniciar sesión.
  alter column clave_hash drop not null,
  add constraint usuarios_verificado_con_clave check (email_verificado_en is null or clave_hash is not null);

-- Las cuentas que ya existían: solo quedan verificadas las que ya probaron su buzón (restablecieron su
-- contraseña con un enlace que les llegó por correo) y el Master, que crea quien controla la base y el
-- entorno. Las demás confirmarán su correo la próxima vez que entren.
update usuarios u set email_verificado_en = now()
where u.rol = 'master'
   or exists (select 1 from historial h where h.usuario_id = u.id and h.accion = 'CLAVE_RESTABLECIDA');

-- Un correo nuevo no está verificado, lo cambie quien lo cambie.
create function reiniciar_verificacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    new.email_verificado_en := null;
  end if;
  return new;
end;
$$;
revoke execute on function reiniciar_verificacion() from public;

create trigger usuarios_reiniciar_verificacion before update of email on usuarios
  for each row execute function reiniciar_verificacion();

-- Hasta ahora los roles de la aplicación podían escribir cualquier columna de usuarios. Desde aquí, solo
-- las que su trabajo necesita: email_verificado_en, tema y las marcas de tiempo quedan fuera de su alcance.
revoke insert, update on usuarios from app_empresa, app_plataforma;
grant insert (empresa_id, nombre, email, dni, clave_hash, rol) on usuarios to app_empresa, app_plataforma;
-- La empresa no cambia correos (la cuenta es de la persona); el Master sí, el de sus administradores.
grant update (nombre, dni, rol, activo, clave_hash) on usuarios to app_empresa;
grant update (nombre, email, dni, activo, clave_hash) on usuarios to app_plataforma;

-- Los enlaces que llegan por correo comparten tabla, huella y forma de gastarse; cambia para qué sirven.
-- enviado_a guarda el buzón que lo recibió: un enlace solo vale mientras ese siga siendo el correo de la
-- cuenta, y el freno de los reenvíos se cuenta por buzón. Los enlaces anteriores (de recuperación, que
-- caducan en 60 minutos) quedan sin él.
alter table recuperaciones_clave
  add column proposito varchar(12) not null default 'recuperacion'
    check (proposito in ('recuperacion', 'invitacion', 'verificacion')),
  add column enviado_a varchar(254);

alter table historial drop constraint historial_accion_del_catalogo;
alter table historial add constraint historial_accion_del_catalogo check (accion in (
  'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA',
  'CLAVE_RESTABLECIDA', 'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA',
  'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
  'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO',
  'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA',
  'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO',
  'DOCUMENTO_RESTAURADO', 'DOCUMENTO_PURGADO', 'RESPALDO_GENERADO', 'VERSION_SUBIDA', 'VERSION_RESTAURADA',
  'LISTADO_EXPORTADO', 'EMPRESA_ELIMINADA',
  'INVITACION_ENVIADA', 'VERIFICACION_ENVIADA', 'CORREO_VERIFICADO'
));
