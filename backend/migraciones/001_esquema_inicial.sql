-- 001 · Esquema inicial: las nueve tablas de docs/03-modelo-datos.md.
--
-- Ninguna clave foránea declara ON DELETE. El comportamiento por defecto impide borrar una fila
-- referenciada, y es lo que se quiere: organizaciones, usuarios y documentos no se borran nunca.

create schema if not exists extensions;
create extension if not exists unaccent schema extensions;
create extension if not exists pg_trgm schema extensions;

-- unaccent no es inmutable y por eso no se puede indexar. Fijar el diccionario con su esquema
-- hace que el resultado dependa solo del texto, y entonces sí se puede declarar inmutable (M8).
create function normalizar(texto text) returns text
  language sql immutable parallel safe strict
  return lower(extensions.unaccent('extensions.unaccent'::regdictionary, texto));

-- actualizado_en no depende de que cada UPDATE de la aplicación se acuerde de tocarlo.
create function marcar_actualizacion() returns trigger
  language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create function rechazar_cambios_en_historial() returns trigger
  language plpgsql
as $$
begin
  raise exception 'El historial solo admite inserciones: % no está permitido', tg_op;
end;
$$;


create table organizaciones (
  id         uuid primary key default gen_random_uuid(),
  nombre     varchar(150) not null check (btrim(nombre) <> ''),
  ruc        char(11) check (ruc ~ '^[0-9]{11}$'),
  creado_en  timestamptz not null default now()
);


create table usuarios (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references organizaciones (id),
  nombre           varchar(120) not null check (btrim(nombre) <> ''),
  email            varchar(254) not null,
  clave_hash       char(60) not null,
  rol              varchar(13) not null check (rol in ('administrador', 'usuario')),
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint usuarios_email_unico unique (email),
  constraint usuarios_email_en_minusculas check (email = lower(email)),
  -- Destino de las claves foráneas compuestas de las demás tablas (M2).
  constraint usuarios_id_organizacion unique (id, organizacion_id)
);

create index usuarios_por_organizacion on usuarios (organizacion_id);

create trigger usuarios_actualizacion before update on usuarios
  for each row execute function marcar_actualizacion();


create table sesiones (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references usuarios (id),
  creada_en    timestamptz not null default now(),
  expira_en    timestamptz not null,
  revocada_en  timestamptz,
  check (expira_en > creada_en)
);

create index sesiones_vigentes_por_usuario on sesiones (usuario_id) where revocada_en is null;


create table categorias (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references organizaciones (id),
  nombre           varchar(80) not null check (btrim(nombre) <> ''),
  descripcion      varchar(255),
  activa           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint categorias_id_organizacion unique (id, organizacion_id)
);

create unique index categorias_nombre_unico on categorias (organizacion_id, lower(nombre));

create trigger categorias_actualizacion before update on categorias
  for each row execute function marcar_actualizacion();


create table documentos (
  id                       uuid primary key default gen_random_uuid(),
  organizacion_id          uuid not null references organizaciones (id),
  categoria_id             uuid not null,
  subido_por               uuid not null,
  nombre                   varchar(200) not null check (btrim(nombre) <> ''),
  descripcion              varchar(1000),
  fecha_documento          date not null,
  archivo_nombre_original  varchar(255) not null,
  archivo_ruta             varchar(300) not null unique,
  archivo_tipo_mime        varchar(100) not null,
  archivo_peso_bytes       integer not null,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),
  eliminado_en             timestamptz,
  constraint documentos_peso_maximo check (archivo_peso_bytes between 1 and 10485760),
  constraint documentos_id_organizacion unique (id, organizacion_id),
  constraint documentos_categoria_de_su_organizacion
    foreign key (categoria_id, organizacion_id) references categorias (id, organizacion_id),
  constraint documentos_propietario_de_su_organizacion
    foreign key (subido_por, organizacion_id) references usuarios (id, organizacion_id)
);

create index documentos_recientes on documentos (organizacion_id, creado_en desc)
  where eliminado_en is null;
create index documentos_por_categoria on documentos (organizacion_id, categoria_id)
  where eliminado_en is null;
create index documentos_por_fecha on documentos (organizacion_id, fecha_documento)
  where eliminado_en is null;
create index documentos_nombre_trigramas on documentos
  using gin (normalizar(nombre) extensions.gin_trgm_ops)
  where eliminado_en is null;

create trigger documentos_actualizacion before update on documentos
  for each row execute function marcar_actualizacion();


create table solicitudes (
  id                     uuid primary key default gen_random_uuid(),
  organizacion_id        uuid not null references organizaciones (id),
  documento_id           uuid not null,
  solicitante_id         uuid not null,
  revisor_id             uuid,
  estado                 varchar(9) not null default 'pendiente'
                           check (estado in ('pendiente', 'aprobada', 'rechazada')),
  comentario_solicitud   varchar(500),
  comentario_resolucion  varchar(500),
  creada_en              timestamptz not null default now(),
  resuelta_en            timestamptz,
  constraint solicitudes_documento_de_su_organizacion
    foreign key (documento_id, organizacion_id) references documentos (id, organizacion_id),
  constraint solicitudes_solicitante_de_su_organizacion
    foreign key (solicitante_id, organizacion_id) references usuarios (id, organizacion_id),
  constraint solicitudes_revisor_de_su_organizacion
    foreign key (revisor_id, organizacion_id) references usuarios (id, organizacion_id),
  constraint solicitudes_resolucion_coherente check (
    (estado = 'pendiente' and revisor_id is null and resuelta_en is null)
    or (estado <> 'pendiente' and revisor_id is not null and resuelta_en is not null)
  ),
  constraint solicitudes_rechazo_con_motivo check (
    estado <> 'rechazada' or btrim(coalesce(comentario_resolucion, '')) <> ''
  ),
  constraint solicitudes_sin_autoaprobacion check (revisor_id <> solicitante_id)
);

create unique index solicitudes_una_pendiente_por_documento on solicitudes (documento_id)
  where estado = 'pendiente';
create index solicitudes_bandeja on solicitudes (organizacion_id, estado, creada_en desc);
create index solicitudes_por_solicitante on solicitudes (solicitante_id, creada_en desc);


create table notificaciones (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references usuarios (id),
  solicitud_id  uuid not null references solicitudes (id),
  tipo          varchar(19) not null
                  check (tipo in ('SOLICITUD_CREADA', 'SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA')),
  mensaje       varchar(300) not null,
  leida_en      timestamptz,
  creada_en     timestamptz not null default now()
);

create index notificaciones_por_usuario on notificaciones (usuario_id, creada_en desc);


create table historial (
  id               bigint generated always as identity primary key,
  organizacion_id  uuid references organizaciones (id),
  usuario_id       uuid,
  rol_usuario      varchar(13) check (rol_usuario in ('administrador', 'usuario')),
  accion           varchar(30) not null,
  entidad_tipo     varchar(12)
                     check (entidad_tipo in ('organizacion', 'usuario', 'sesion', 'categoria', 'documento', 'solicitud')),
  entidad_id       uuid,
  detalle          jsonb not null default '{}',
  user_agent       varchar(300),
  es_movil         boolean,
  creado_en        timestamptz not null default now(),
  constraint historial_accion_del_catalogo check (accion in (
    'ORGANIZACION_REGISTRADA', 'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA',
    'CLAVE_CAMBIADA', 'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO',
    'USUARIO_REACTIVADO', 'CATEGORIA_CREADA', 'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO',
    'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO', 'DOCUMENTO_DESCARGADO',
    'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA',
    'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO'
  )),
  constraint historial_usuario_de_su_organizacion
    foreign key (usuario_id, organizacion_id) references usuarios (id, organizacion_id),
  -- La clave compuesta no se comprueba si falta la organización; esto impide un usuario sin ella.
  constraint historial_usuario_con_organizacion check (usuario_id is null or organizacion_id is not null),
  -- Indicador 6: cada acción con autor guarda el rol que tenía al actuar.
  constraint historial_usuario_con_rol check ((usuario_id is null) = (rol_usuario is null)),
  constraint historial_entidad_completa check ((entidad_tipo is null) = (entidad_id is null))
);

create index historial_por_organizacion on historial (organizacion_id, creado_en desc);
create index historial_por_usuario on historial (organizacion_id, usuario_id, creado_en desc);
create index historial_por_entidad on historial (organizacion_id, entidad_tipo, entidad_id);

create trigger historial_sin_modificaciones before update or delete on historial
  for each row execute function rechazar_cambios_en_historial();
create trigger historial_sin_vaciado before truncate on historial
  for each statement execute function rechazar_cambios_en_historial();


create table tiempos_respuesta (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid not null references usuarios (id),
  operacion             varchar(30) not null check (operacion in ('LISTAR_DOCUMENTOS')),
  con_filtros           boolean not null,
  total_resultados      integer not null check (total_resultados >= 0),
  duracion_servidor_ms  integer not null check (duracion_servidor_ms >= 0),
  duracion_cliente_ms   integer check (duracion_cliente_ms between 0 and 120000),
  es_movil              boolean not null,
  creado_en             timestamptz not null default now()
);


-- D14: la API se conecta como dueña de las tablas, y a la dueña RLS no se le aplica. Activarlo sin
-- políticas cierra cualquier otro camino, como la API automática de Supabase si se reactivara.
alter table organizaciones enable row level security;
alter table usuarios enable row level security;
alter table sesiones enable row level security;
alter table categorias enable row level security;
alter table documentos enable row level security;
alter table solicitudes enable row level security;
alter table notificaciones enable row level security;
alter table historial enable row level security;
alter table tiempos_respuesta enable row level security;
