-- 009 · Versiones de un documento (RF34, D30).
--
-- Corregir un archivo ya no obliga a eliminar el documento y subir otro: cada versión queda guardada
-- con quién la subió y cuándo, y nada se sobrescribe. El documento conserva sus columnas de archivo
-- como la versión vigente, así que el listado, la búsqueda, la ficha y la descarga no cambian.

create table documento_versiones (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references empresas (id),
  documento_id             uuid not null,
  numero                   integer not null check (numero >= 1),
  archivo_nombre_original  varchar(255) not null,
  archivo_ruta             varchar(300) not null unique,
  archivo_tipo_mime        varchar(100) not null,
  archivo_peso_bytes       integer not null check (archivo_peso_bytes between 1 and 10485760),
  subida_por               uuid not null,
  comentario               varchar(500) check (btrim(comentario) <> ''),
  -- Restaurar no retrocede: copia una versión anterior como versión nueva y guarda de cuál viene.
  restaurada_de            integer check (restaurada_de >= 1 and restaurada_de < numero),
  creada_en                timestamptz not null default now(),
  constraint documento_versiones_numero_unico unique (documento_id, numero),
  constraint documento_versiones_de_su_documento
    foreign key (documento_id, empresa_id) references documentos (id, empresa_id),
  constraint documento_versiones_autor_de_su_empresa
    foreign key (subida_por, empresa_id) references usuarios (id, empresa_id)
);

-- La versión vigente, para no contar las versiones en cada ficha.
alter table documentos add column version integer not null default 1 check (version >= 1);

-- La aprobación es de una versión: con una nueva, la ficha dice en cuál se aprobó.
alter table solicitudes add column version integer not null default 1 check (version >= 1);

-- Cada documento que ya existe tiene su versión 1: su archivo, su autor y su fecha.
insert into documento_versiones (empresa_id, documento_id, numero, archivo_nombre_original, archivo_ruta,
                                 archivo_tipo_mime, archivo_peso_bytes, subida_por, creada_en)
select empresa_id, id, 1, archivo_nombre_original, archivo_ruta, archivo_tipo_mime, archivo_peso_bytes, subido_por, creado_en
from documentos;

-- Aislamiento como en todas las tablas de negocio, y la visibilidad se hereda del documento: la
-- subconsulta pasa por la RLS de documentos, así que una categoría restringida oculta también sus
-- versiones (D22) sin reglas nuevas. Sin DELETE ni UPDATE: una versión no cambia.
alter table documento_versiones enable row level security;
grant select, insert on documento_versiones to app_empresa;
create policy aislamiento on documento_versiones for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
create policy visibilidad on documento_versiones as restrictive for all to app_empresa
  using (exists (select 1 from documentos d where d.id = documento_id))
  with check (exists (select 1 from documentos d where d.id = documento_id));

alter table historial drop constraint historial_accion_del_catalogo;
alter table historial add constraint historial_accion_del_catalogo check (accion in (
  'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA',
  'CLAVE_RESTABLECIDA', 'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA',
  'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
  'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO',
  'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA',
  'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO',
  'DOCUMENTO_RESTAURADO', 'DOCUMENTO_PURGADO', 'RESPALDO_GENERADO', 'VERSION_SUBIDA', 'VERSION_RESTAURADA'
));

-- El almacenamiento que ve el Master suma todas las versiones: es lo que ocupa de verdad. Lo purgado ya
-- no está en el bucket (005).
create or replace function metricas_de_empresas()
  returns table (empresa_id uuid, usuarios bigint, usuarios_activos bigint, documentos bigint,
                 almacenamiento_bytes bigint, ultimo_acceso timestamptz)
  language sql stable security definer set search_path = public
as $$
  select e.id,
         (select count(*) from usuarios u where u.empresa_id = e.id),
         (select count(*) from usuarios u where u.empresa_id = e.id and u.activo),
         (select count(*) from documentos d where d.empresa_id = e.id and d.eliminado_en is null),
         (select coalesce(sum(v.archivo_peso_bytes), 0)
            from documento_versiones v join documentos d on d.id = v.documento_id
           where v.empresa_id = e.id and d.purgado_en is null),
         (select max(s.creada_en) from sesiones s join usuarios u on u.id = s.usuario_id where u.empresa_id = e.id)
  from empresas e;
$$;
