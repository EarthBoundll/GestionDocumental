-- 001 · Esquema inicial (v2): multiempresa por columna compartida, con aislamiento en la propia base.
--
-- Ninguna clave foránea declara ON DELETE. El comportamiento por defecto impide borrar una fila
-- referenciada, y es lo que se quiere: empresas, usuarios y documentos no se borran nunca.

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


-- Aislamiento (D17). La API no consulta los datos de una empresa con el rol dueño de las tablas:
-- en cada transacción adopta uno de estos dos roles, que no pueden iniciar sesión, y fija la empresa
-- activa. Las políticas de abajo hacen el resto: una consulta que olvide filtrar por empresa no
-- devuelve nada ajeno, porque la base no se lo da.
-- Los roles son de todo el servidor, no de una base: pueden existir ya, o estar creándolos a la vez otra
-- base del mismo servidor (las pruebas migran varias en paralelo). En ambos casos basta con que existan.
do $$
declare
  rol text;
begin
  foreach rol in array array['app_empresa', 'app_plataforma'] loop
    begin
      execute format('create role %I nologin', rol);
    exception when duplicate_object or unique_violation then
      null;
    end;
    begin
      execute format('grant %I to current_user', rol);
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

-- La empresa activa de la transacción. Sin fijar es nula, y entonces ninguna fila coincide.
create function empresa_actual() returns uuid
  language sql stable
  return nullif(current_setting('app.empresa_id', true), '')::uuid;


create table empresas (
  id              uuid primary key default gen_random_uuid(),
  nombre          varchar(150) not null check (btrim(nombre) <> ''),
  ruc             char(11) check (ruc ~ '^[0-9]{11}$'),
  activa          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  -- Un RUC identifica a un contribuyente: dos empresas con el mismo serían la misma registrada dos veces.
  constraint empresas_ruc_unico unique (ruc)
);

create trigger empresas_actualizacion before update on empresas
  for each row execute function marcar_actualizacion();


create table usuarios (
  id              uuid primary key default gen_random_uuid(),
  -- Nula solo para el Administrador Master, que no pertenece a ninguna empresa.
  empresa_id      uuid references empresas (id),
  nombre          varchar(120) not null check (btrim(nombre) <> ''),
  email           varchar(254) not null,
  -- Dato del perfil, nunca una credencial (CLAUDE.md v2).
  dni             char(8) check (dni ~ '^[0-9]{8}$'),
  clave_hash      char(60) not null,
  rol             varchar(13) not null check (rol in ('master', 'administrador', 'usuario')),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint usuarios_email_unico unique (email),
  constraint usuarios_email_en_minusculas check (email = lower(email)),
  constraint usuarios_master_sin_empresa check ((rol = 'master') = (empresa_id is null)),
  -- Destino de las claves foráneas compuestas de las demás tablas (M2).
  constraint usuarios_id_empresa unique (id, empresa_id)
);

-- La cuenta del Master es única: la base no admite una segunda, venga de donde venga.
create unique index usuarios_un_solo_master on usuarios ((true)) where rol = 'master';
create index usuarios_por_empresa on usuarios (empresa_id);

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


-- Recuperación de contraseña: se guarda el hash del token, nunca el token, y sirve una sola vez.
create table recuperaciones_clave (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references usuarios (id),
  token_hash   char(64) not null unique,
  creada_en    timestamptz not null default now(),
  expira_en    timestamptz not null,
  usada_en     timestamptz,
  check (expira_en > creada_en)
);

create index recuperaciones_vigentes_por_usuario on recuperaciones_clave (usuario_id) where usada_en is null;


create table categorias (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas (id),
  nombre          varchar(80) not null check (btrim(nombre) <> ''),
  descripcion     varchar(255),
  activa          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint categorias_id_empresa unique (id, empresa_id)
);

create unique index categorias_nombre_unico on categorias (empresa_id, lower(nombre));

create trigger categorias_actualizacion before update on categorias
  for each row execute function marcar_actualizacion();


create table documentos (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references empresas (id),
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
  constraint documentos_id_empresa unique (id, empresa_id),
  constraint documentos_categoria_de_su_empresa
    foreign key (categoria_id, empresa_id) references categorias (id, empresa_id),
  constraint documentos_propietario_de_su_empresa
    foreign key (subido_por, empresa_id) references usuarios (id, empresa_id)
);

create index documentos_recientes on documentos (empresa_id, creado_en desc)
  where eliminado_en is null;
create index documentos_por_categoria on documentos (empresa_id, categoria_id)
  where eliminado_en is null;
create index documentos_por_fecha on documentos (empresa_id, fecha_documento)
  where eliminado_en is null;
create index documentos_nombre_trigramas on documentos
  using gin (normalizar(nombre) extensions.gin_trgm_ops)
  where eliminado_en is null;

create trigger documentos_actualizacion before update on documentos
  for each row execute function marcar_actualizacion();


create table solicitudes (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references empresas (id),
  documento_id           uuid not null,
  solicitante_id         uuid not null,
  revisor_id             uuid,
  estado                 varchar(9) not null default 'pendiente'
                           check (estado in ('pendiente', 'aprobada', 'rechazada')),
  comentario_solicitud   varchar(500),
  comentario_resolucion  varchar(500),
  creada_en              timestamptz not null default now(),
  resuelta_en            timestamptz,
  constraint solicitudes_id_empresa unique (id, empresa_id),
  constraint solicitudes_documento_de_su_empresa
    foreign key (documento_id, empresa_id) references documentos (id, empresa_id),
  constraint solicitudes_solicitante_de_su_empresa
    foreign key (solicitante_id, empresa_id) references usuarios (id, empresa_id),
  constraint solicitudes_revisor_de_su_empresa
    foreign key (revisor_id, empresa_id) references usuarios (id, empresa_id),
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
create index solicitudes_bandeja on solicitudes (empresa_id, estado, creada_en desc);
create index solicitudes_por_solicitante on solicitudes (solicitante_id, creada_en desc);


create table notificaciones (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas (id),
  usuario_id    uuid not null,
  solicitud_id  uuid not null,
  tipo          varchar(19) not null
                  check (tipo in ('SOLICITUD_CREADA', 'SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA')),
  mensaje       varchar(300) not null,
  leida_en      timestamptz,
  creada_en     timestamptz not null default now(),
  -- Nadie recibe un aviso sobre una solicitud de otra empresa: lo impide la base, no solo el código.
  constraint notificaciones_destinatario_de_su_empresa
    foreign key (usuario_id, empresa_id) references usuarios (id, empresa_id),
  constraint notificaciones_solicitud_de_su_empresa
    foreign key (solicitud_id, empresa_id) references solicitudes (id, empresa_id)
);

create index notificaciones_por_usuario on notificaciones (usuario_id, creada_en desc);


create table historial (
  id               bigint generated always as identity primary key,
  -- La empresa del asiento: la del autor o, si actúa el Master, la empresa sobre la que actúa.
  -- Nula en lo que no es de ninguna empresa: un acceso con un correo desconocido, o el Master en su cuenta.
  empresa_id       uuid references empresas (id),
  usuario_id       uuid references usuarios (id),
  rol_usuario      varchar(13) check (rol_usuario in ('master', 'administrador', 'usuario')),
  accion           varchar(30) not null,
  entidad_tipo     varchar(12)
                     check (entidad_tipo in ('empresa', 'usuario', 'sesion', 'categoria', 'documento', 'solicitud')),
  entidad_id       uuid,
  detalle          jsonb not null default '{}',
  user_agent       varchar(300),
  es_movil         boolean,
  creado_en        timestamptz not null default now(),
  constraint historial_accion_del_catalogo check (accion in (
    'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA',
    'CLAVE_RESTABLECIDA', 'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA',
    'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
    'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO',
    'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA',
    'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO'
  )),
  -- Indicador 6: cada acción con autor guarda el rol que tenía al actuar.
  constraint historial_usuario_con_rol check ((usuario_id is null) = (rol_usuario is null)),
  constraint historial_entidad_completa check ((entidad_tipo is null) = (entidad_id is null))
);

create index historial_por_empresa on historial (empresa_id, creado_en desc);
create index historial_por_usuario on historial (empresa_id, usuario_id, creado_en desc);
create index historial_por_entidad on historial (empresa_id, entidad_tipo, entidad_id);

create trigger historial_sin_modificaciones before update or delete on historial
  for each row execute function rechazar_cambios_en_historial();
create trigger historial_sin_vaciado before truncate on historial
  for each statement execute function rechazar_cambios_en_historial();

-- El autor de un asiento pertenece a la empresa del asiento y tenía ese rol. La única excepción es el
-- Master, y está escrita aquí, no es el efecto de una comprobación ausente (CLAUDE.md v2). La función
-- mira la tabla de usuarios entera, por encima del aislamiento, porque su trabajo es justo comprobarlo.
create function comprobar_autor_del_historial() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  autor usuarios%rowtype;
begin
  if new.usuario_id is null then
    return new;
  end if;
  select * into autor from usuarios where id = new.usuario_id;
  if autor.rol is distinct from new.rol_usuario then
    raise exception 'El rol del asiento no es el de su autor' using errcode = 'check_violation',
      constraint = 'historial_rol_del_autor';
  end if;
  if autor.rol <> 'master' and autor.empresa_id is distinct from new.empresa_id then
    raise exception 'El autor del asiento no pertenece a esa empresa' using errcode = 'foreign_key_violation',
      constraint = 'historial_autor_de_su_empresa';
  end if;
  return new;
end;
$$;

create trigger historial_autor_coherente before insert on historial
  for each row execute function comprobar_autor_del_historial();


create table tiempos_respuesta (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references empresas (id),
  usuario_id            uuid not null,
  operacion             varchar(30) not null check (operacion in ('LISTAR_DOCUMENTOS')),
  con_filtros           boolean not null,
  total_resultados      integer not null check (total_resultados >= 0),
  duracion_servidor_ms  integer not null check (duracion_servidor_ms >= 0),
  duracion_cliente_ms   integer check (duracion_cliente_ms between 0 and 120000),
  es_movil              boolean not null,
  creado_en             timestamptz not null default now(),
  constraint tiempos_usuario_de_su_empresa
    foreign key (usuario_id, empresa_id) references usuarios (id, empresa_id)
);


-- Métricas del Master: solo conteos. Corre por encima del aislamiento para poder sumar todas las
-- empresas, y por eso devuelve cifras y nunca el contenido de un documento (decisión E).
create function metricas_de_empresas()
  returns table (empresa_id uuid, usuarios bigint, usuarios_activos bigint, documentos bigint,
                 almacenamiento_bytes bigint, ultimo_acceso timestamptz)
  language sql stable security definer set search_path = public
as $$
  select e.id,
         (select count(*) from usuarios u where u.empresa_id = e.id),
         (select count(*) from usuarios u where u.empresa_id = e.id and u.activo),
         (select count(*) from documentos d where d.empresa_id = e.id and d.eliminado_en is null),
         (select coalesce(sum(d.archivo_peso_bytes), 0) from documentos d where d.empresa_id = e.id),
         (select max(s.creada_en) from sesiones s join usuarios u on u.id = s.usuario_id where u.empresa_id = e.id)
  from empresas e;
$$;
revoke all on function metricas_de_empresas() from public;

-- Al desactivar una empresa se cierran las sesiones de todos sus usuarios. El Master solo ve a los
-- administradores, así que lo hace esta función, que solo sabe hacer eso y devuelve cuántas cerró.
create function revocar_sesiones_de_empresa(empresa uuid) returns integer
  language sql security definer set search_path = public
as $$
  with revocadas as (
    update sesiones s set revocada_en = now()
    from usuarios u
    where u.id = s.usuario_id and u.empresa_id = empresa and s.revocada_en is null
    returning 1
  )
  select count(*)::integer from revocadas;
$$;
revoke all on function revocar_sesiones_de_empresa(uuid) from public;


-- D14: RLS en todas las tablas. Sin una política para un rol, ese rol no ve nada: así quedan cerradas
-- también las vías que la API no usa, como la API automática de Supabase.
alter table empresas enable row level security;
alter table usuarios enable row level security;
alter table sesiones enable row level security;
alter table recuperaciones_clave enable row level security;
alter table categorias enable row level security;
alter table documentos enable row level security;
alter table solicitudes enable row level security;
alter table notificaciones enable row level security;
alter table historial enable row level security;
alter table tiempos_respuesta enable row level security;

grant usage on schema public, extensions to app_empresa, app_plataforma;

-- app_empresa: lo que hacen el Administrador de Empresa y el Usuario, siempre dentro de su empresa.
-- Nunca DELETE: aquí nada se borra.
grant select on empresas to app_empresa;
grant select, insert, update on usuarios, categorias, documentos, solicitudes, notificaciones, tiempos_respuesta to app_empresa;
grant select, update on sesiones to app_empresa;
grant select, insert on historial to app_empresa;

create policy aislamiento on empresas for select to app_empresa using (id = empresa_actual());
create policy aislamiento on usuarios for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
create policy aislamiento on categorias for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
create policy aislamiento on documentos for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
create policy aislamiento on solicitudes for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
create policy aislamiento on notificaciones for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
create policy aislamiento on tiempos_respuesta for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
create policy aislamiento on historial for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
-- Las sesiones no tienen empresa: se ven las de los usuarios que esta empresa puede ver.
create policy aislamiento on sesiones for all to app_empresa
  using (exists (select 1 from usuarios u where u.id = usuario_id));

-- app_plataforma: lo que hace el Master. Gestiona empresas y a sus administradores, revoca sesiones al
-- desactivar, siembra las categorías iniciales y deja constancia. No tiene permisos sobre documentos,
-- solicitudes, notificaciones ni tiempos de respuesta: no puede leer el contenido de ninguna empresa.
grant select, insert, update on empresas to app_plataforma;
grant select, insert, update on usuarios to app_plataforma;
grant select, update on sesiones to app_plataforma;
grant insert on categorias, historial to app_plataforma;
grant execute on function metricas_de_empresas(), revocar_sesiones_de_empresa(uuid) to app_plataforma;

create policy plataforma on empresas for all to app_plataforma using (true) with check (true);
-- De los usuarios, solo los administradores de empresa: el resto es asunto de cada empresa.
create policy plataforma on usuarios for all to app_plataforma
  using (rol = 'administrador') with check (rol = 'administrador' and empresa_id is not null);
create policy plataforma on sesiones for all to app_plataforma using (true);
create policy plataforma on categorias for insert to app_plataforma with check (true);
create policy plataforma on historial for insert to app_plataforma with check (true);
