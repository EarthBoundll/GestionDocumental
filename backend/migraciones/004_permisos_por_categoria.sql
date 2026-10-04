-- 004 · Permisos de visibilidad por categoría (RF25, D22).
--
-- Un administrador puede restringir una categoría a personas concretas de su empresa. Los
-- administradores ven todas; un usuario ve las abiertas y las restringidas en las que tiene acceso, con
-- sus documentos. La restricción manda sobre la autoría: quien subió un documento a una categoría que
-- luego se restringe sin incluirlo deja de verlo, porque es el administrador quien decide qué es
-- confidencial. Lo decide la base, igual que el aislamiento entre empresas (D17): una consulta que olvide
-- el permiso no devuelve lo que la persona no puede ver.

alter table categorias add column restringida boolean not null default false;

create table categoria_accesos (
  categoria_id  uuid not null,
  usuario_id    uuid not null,
  empresa_id    uuid not null references empresas (id),
  creado_en     timestamptz not null default now(),
  primary key (categoria_id, usuario_id),
  constraint categoria_accesos_categoria_de_su_empresa
    foreign key (categoria_id, empresa_id) references categorias (id, empresa_id),
  constraint categoria_accesos_usuario_de_su_empresa
    foreign key (usuario_id, empresa_id) references usuarios (id, empresa_id)
);
create index categoria_accesos_usuario on categoria_accesos (usuario_id);

-- Quién actúa en la transacción, además de en qué empresa (empresa_actual). La API los fija junto a la
-- empresa (src/db/acceso.ts); sin fijar son nulos y no abren nada.
create function usuario_actual() returns uuid
  language sql stable set search_path = ''
  return nullif(current_setting('app.usuario_id', true), '')::uuid;

create function rol_actual() returns text
  language sql stable set search_path = ''
  return nullif(current_setting('app.rol', true), '');

-- SECURITY DEFINER para leer categorías y accesos sin pasar por su propia RLS (que la usa), siempre
-- dentro de la empresa activa.
create function puede_ver_categoria(categoria uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select rol_actual() = 'administrador'
      or exists (
        select 1 from categorias c
        where c.id = categoria
          and c.empresa_id = empresa_actual()
          and (not c.restringida
               or exists (select 1 from categoria_accesos a where a.categoria_id = c.id and a.usuario_id = usuario_actual()))
      );
$$;
revoke all on function puede_ver_categoria(uuid) from public;
grant execute on function puede_ver_categoria(uuid) to app_empresa;

-- Las políticas restrictivas se suman (AND) a la de aislamiento por empresa de la 001.
create policy visibilidad on categorias as restrictive for select to app_empresa
  using (puede_ver_categoria(id));

create policy visibilidad on documentos as restrictive for all to app_empresa
  using (puede_ver_categoria(categoria_id)) with check (puede_ver_categoria(categoria_id));

-- Los accesos son configuración, no datos de negocio: se quitan cuando el administrador quita a alguien.
-- Por eso, a diferencia del resto, admiten DELETE. Cada cambio queda en el historial (CATEGORIA_EDITADA).
alter table categoria_accesos enable row level security;
grant select, insert, delete on categoria_accesos to app_empresa;
create policy aislamiento on categoria_accesos for all to app_empresa
  using (empresa_id = empresa_actual()) with check (empresa_id = empresa_actual());
create policy solo_administradores on categoria_accesos as restrictive for all to app_empresa
  using (rol_actual() = 'administrador') with check (rol_actual() = 'administrador');
