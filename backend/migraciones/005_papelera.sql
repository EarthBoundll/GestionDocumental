-- 005 · Papelera de la empresa (RF26, D23).
--
-- Eliminar un documento ya era un borrado lógico (eliminado_en). Ahora se guarda también quién lo
-- eliminó, un administrador puede restaurarlo, y pasados 30 días —o antes, si un administrador lo
-- decide— se purga: se borra su archivo del almacenamiento y la fila queda como constancia, con
-- purgado_en. Las filas siguen sin borrarse nunca (001: app_empresa no tiene DELETE), porque el
-- historial y las solicitudes las referencian.

alter table documentos
  add column eliminado_por uuid,
  add column purgado_en timestamptz,
  add constraint documentos_eliminador_de_su_empresa
    foreign key (eliminado_por, empresa_id) references usuarios (id, empresa_id),
  -- Solo se purga lo que está en la papelera, y lo purgado no vuelve.
  add constraint documentos_purgado_tras_eliminar check (purgado_en is null or eliminado_en is not null);

-- La papelera y la purga buscan por fecha de eliminación entre los no purgados.
create index documentos_en_papelera on documentos (empresa_id, eliminado_en)
  where eliminado_en is not null and purgado_en is null;

alter table historial drop constraint historial_accion_del_catalogo;
alter table historial add constraint historial_accion_del_catalogo check (accion in (
  'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA',
  'CLAVE_RESTABLECIDA', 'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA',
  'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
  'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO',
  'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA',
  'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO',
  'DOCUMENTO_RESTAURADO', 'DOCUMENTO_PURGADO'
));

-- El almacenamiento que ve el Master es el que ocupa de verdad: lo purgado ya no está en el bucket.
create or replace function metricas_de_empresas()
  returns table (empresa_id uuid, usuarios bigint, usuarios_activos bigint, documentos bigint,
                 almacenamiento_bytes bigint, ultimo_acceso timestamptz)
  language sql stable security definer set search_path = public
as $$
  select e.id,
         (select count(*) from usuarios u where u.empresa_id = e.id),
         (select count(*) from usuarios u where u.empresa_id = e.id and u.activo),
         (select count(*) from documentos d where d.empresa_id = e.id and d.eliminado_en is null),
         (select coalesce(sum(d.archivo_peso_bytes), 0) from documentos d where d.empresa_id = e.id and d.purgado_en is null),
         (select max(s.creada_en) from sesiones s join usuarios u on u.id = s.usuario_id where u.empresa_id = e.id)
  from empresas e;
$$;
