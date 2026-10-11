-- 016 · La baja de una cuenta (D46).
--
-- Desactivar suspende una cuenta y se deshace. Darla de baja («Eliminar» en la pantalla) es para siempre: la
-- cuenta deja de aparecer, no vuelve a entrar y su correo queda libre para otra invitación. La fila no se
-- borra: sus documentos, versiones, solicitudes y el historial, que nadie puede modificar, la nombran por
-- clave foránea. Se queda solo con lo que hace falta para leer esa traza, su nombre y su rol; el correo, el
-- DNI y la contraseña se borran. Lo demás se elimina al cierre del estudio, con la empresa (D33).

alter table usuarios
  add column eliminado_en timestamptz,
  -- Solo una cuenta dada de baja se queda sin correo; las demás lo siguen necesitando para entrar.
  alter column email drop not null,
  add constraint usuarios_con_correo_salvo_de_baja check (eliminado_en is not null or email is not null),
  -- Dada de baja es definitivo: inactiva y sin datos de contacto ni credencial. Reactivarla violaría esto.
  add constraint usuarios_de_baja_sin_datos check (
    eliminado_en is null or (not activo and email is null and dni is null and clave_hash is null)),
  add constraint usuarios_master_sin_baja check (eliminado_en is null or rol <> 'master');

-- La empresa no puede escribir correos (013) ni eliminado_en: la baja pasa por aquí, que corre con el
-- dueño de las tablas y decide con la identidad de la transacción (004), como las políticas RLS. Solo un
-- administrador, solo en su empresa, nunca sobre sí mismo: el que actúa sigue siendo administrador, así que
-- la empresa no se queda sin uno. El Master no tiene empresa: no hay fila que encontrar.
create function dar_de_baja_usuario(objetivo uuid) returns text
  language plpgsql security definer set search_path = public
as $$
declare
  nombre_de_la_cuenta text;
begin
  if rol_actual() is distinct from 'administrador' or empresa_actual() is null then
    raise exception 'Solo un administrador de la empresa da de baja una cuenta' using errcode = '42501';
  end if;
  if objetivo = usuario_actual() then
    raise exception 'Nadie se da de baja a sí mismo' using errcode = '42501';
  end if;
  select u.nombre into nombre_de_la_cuenta from usuarios u
   where u.id = objetivo and u.empresa_id = empresa_actual() and u.eliminado_en is null
   for update;
  if not found then
    return null;
  end if;
  -- Sus permisos en categorías restringidas ya no son de nadie.
  delete from categoria_accesos where usuario_id = objetivo and empresa_id = empresa_actual();
  update usuarios
     set eliminado_en = now(), activo = false, email = null, dni = null, clave_hash = null, email_verificado_en = null
   where id = objetivo;
  return nombre_de_la_cuenta;
end;
$$;
revoke execute on function dar_de_baja_usuario(uuid) from public;
grant execute on function dar_de_baja_usuario(uuid) to app_empresa;

-- Las cifras del Master no cuentan las cuentas dadas de baja (009, misma función).
create or replace function metricas_de_empresas()
  returns table (empresa_id uuid, usuarios bigint, usuarios_activos bigint, documentos bigint,
                 almacenamiento_bytes bigint, ultimo_acceso timestamptz)
  language sql stable security definer set search_path = public
as $$
  select e.id,
         (select count(*) from usuarios u where u.empresa_id = e.id and u.eliminado_en is null),
         (select count(*) from usuarios u where u.empresa_id = e.id and u.activo),
         (select count(*) from documentos d where d.empresa_id = e.id and d.eliminado_en is null),
         (select coalesce(sum(v.archivo_peso_bytes), 0)
            from documento_versiones v join documentos d on d.id = v.documento_id
           where v.empresa_id = e.id and d.purgado_en is null),
         (select max(s.creada_en) from sesiones s join usuarios u on u.id = s.usuario_id where u.empresa_id = e.id)
  from empresas e;
$$;

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
  'INVITACION_ENVIADA', 'VERIFICACION_ENVIADA', 'CORREO_VERIFICADO',
  'USUARIO_ELIMINADO'
));
