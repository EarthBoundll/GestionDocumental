-- 003 · Lo que señala el asesor de seguridad de Supabase sobre las funciones (D14).
--
-- Las funciones de trigger no las llama nadie: las dispara la base, y un trigger no comprueba el permiso
-- EXECUTE al dispararse. Sin ese permiso para public, tampoco se pueden invocar por la API automática de
-- Supabase, que es lo que el asesor marca en comprobar_autor_del_historial (SECURITY DEFINER).
revoke execute on function comprobar_autor_del_historial() from public;
revoke execute on function marcar_actualizacion() from public;
revoke execute on function rechazar_cambios_en_historial() from public;

-- Un search_path fijo impide que un esquema creado después cambie a qué objeto apunta un nombre. En
-- normalizar y empresa_actual el cuerpo ya está resuelto al crearlas (cuerpo SQL estándar), pero se fija
-- igual: así ninguna función queda a merced del search_path de quien la llame.
alter function normalizar(text) set search_path = '';
alter function empresa_actual() set search_path = '';
alter function marcar_actualizacion() set search_path = '';
alter function rechazar_cambios_en_historial() set search_path = '';
