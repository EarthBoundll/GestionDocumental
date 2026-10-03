-- 002 · La API automática de Supabase tampoco alcanza las funciones (D14).
--
-- Supabase concede por defecto a los roles de su API automática (anon y authenticated) todo lo que el
-- dueño crea en public, funciones incluidas, y el «revoke … from public» de la 001 no les quita esa
-- concesión explícita. RLS cierra las tablas, pero no una función SECURITY DEFINER: con la Data API
-- encendida, cualquiera con la clave pública podría llamar a revocar_sesiones_de_empresa() o leer las
-- cifras de todas las empresas. Aquí se les quita todo, lo que ya existe y lo que se cree después.
-- Donde esos roles no existen (en local y en las pruebas), no hace nada.
do $$
declare
  rol text;
begin
  foreach rol in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = rol) then
      execute format('revoke all on all tables in schema public from %I', rol);
      execute format('revoke all on all sequences in schema public from %I', rol);
      execute format('revoke all on all functions in schema public from %I', rol);
      execute format('alter default privileges in schema public revoke all on tables from %I', rol);
      execute format('alter default privileges in schema public revoke all on sequences from %I', rol);
      execute format('alter default privileges in schema public revoke all on functions from %I', rol);
    end if;
  end loop;
end;
$$;
