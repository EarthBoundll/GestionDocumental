-- 006 · Auditoría de la plataforma (RF27, D24) y bloqueo por cuenta (RN21).
--
-- El Master puede leer el historial de la plataforma: sus propias acciones —también las que hizo sobre
-- una empresa— y lo que no pertenece a ninguna, como los intentos de entrar con un correo desconocido.
-- La actividad de cada empresa sigue siendo solo de esa empresa (D18): el Master ve qué hizo la
-- plataforma, no qué hicieron las personas con sus documentos.

grant select on historial to app_plataforma;

create policy plataforma_lectura on historial for select to app_plataforma
  using (empresa_id is null or rol_usuario = 'master');

-- RN21: tras cinco contraseñas incorrectas para el mismo correo en 15 minutos, ese correo queda
-- bloqueado un rato. Se cuenta por correo, exista o no la cuenta, para que el bloqueo no revele cuáles
-- existen; este índice hace barata la cuenta.
create index historial_fallos_por_correo on historial ((detalle ->> 'email'), creado_en)
  where accion = 'SESION_FALLIDA';
