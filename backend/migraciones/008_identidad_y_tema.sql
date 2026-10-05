-- 008 · Identidad visual de cada empresa (RF31, D28) y tema de cada persona (RF32).
--
-- La identidad es reducida a propósito: un nombre comercial, un color y un logo. El nombre de siempre
-- sigue siendo la razón social, que solo cambia el Master.

alter table empresas
  add column nombre_comercial varchar(60) check (btrim(nombre_comercial) <> ''),
  -- En minúsculas, para comparar sin sorpresas. El contraste lo valida la API: la base no calcula colores.
  add column color_primario char(7) check (color_primario ~ '^#[0-9a-f]{6}$'),
  -- En el almacenamiento privado de los documentos, en la carpeta de la empresa: el logo tampoco es público.
  add column logo_ruta varchar(255) check (logo_ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg)$'),
  -- Y en la carpeta de esa empresa, no en la de otra.
  add constraint empresas_logo_en_su_carpeta check (starts_with(logo_ruta, id::text || '/'));

-- Hasta ahora el rol de empresa solo leía su fila. Ahora puede cambiar estas tres columnas y ninguna
-- otra, y solo si quien actúa es administrador de esa empresa: la base lo impide aunque el código se
-- equivoque, como con las categorías restringidas (D22).
grant update (nombre_comercial, color_primario, logo_ruta) on empresas to app_empresa;
create policy identidad on empresas for update to app_empresa
  using (id = empresa_actual() and rol_actual() = 'administrador')
  with check (id = empresa_actual() and rol_actual() = 'administrador');

-- El tema de la interfaz lo elige cada persona y la sigue en cualquier dispositivo. «sistema» es el del
-- dispositivo. No es una acción sobre datos: no pasa por el historial.
alter table usuarios
  add column tema varchar(7) not null default 'sistema' check (tema in ('sistema', 'claro', 'oscuro'));
