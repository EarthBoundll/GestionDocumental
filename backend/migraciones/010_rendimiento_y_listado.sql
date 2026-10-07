-- 010 · La visibilidad por categoría, una vez por consulta (D31), y el listado documental (RF35).
--
-- La prueba de carga (docs/evidencias/prueba-de-carga.md) mostró que con 50.000 documentos el listado de
-- una usuaria tardaba 1,9 s: la política de la 004 llamaba a puede_ver_categoria() por cada fila, dos
-- veces por página (el total y la página), y una función SECURITY DEFINER no se puede integrar en la
-- consulta. Ahora la política pregunta una sola vez qué categorías ve quien consulta —son pocas— y cada
-- fila solo se compara con esa lista. Decide exactamente lo mismo que antes.

-- Las categorías de la empresa activa que puede ver quien actúa: todas para un administrador; para un
-- usuario, las abiertas y las restringidas en las que tiene acceso. SECURITY DEFINER por lo mismo que en
-- la 004: lee categorías y accesos sin pasar por su propia RLS, siempre dentro de la empresa activa.
create function categorias_visibles() returns uuid[]
  language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(c.id), '{}')
  from categorias c
  where c.empresa_id = empresa_actual()
    and (rol_actual() = 'administrador'
         or not c.restringida
         or exists (select 1 from categoria_accesos a where a.categoria_id = c.id and a.usuario_id = usuario_actual()));
$$;
revoke all on function categorias_visibles() from public;
grant execute on function categorias_visibles() to app_empresa;

-- «(select …)» sin referencias a la fila es un InitPlan: PostgreSQL lo evalúa una vez por consulta. El
-- «::uuid[]» pide la forma de arreglo de ANY; sin él, ANY (select …) compararía con cada fila del select.
drop policy visibilidad on documentos;
create policy visibilidad on documentos as restrictive for all to app_empresa
  using (categoria_id = any ((select categorias_visibles())::uuid[]))
  with check (categoria_id = any ((select categorias_visibles())::uuid[]));

-- RF35: exportar el listado documental es una acción auditable, como exportar el historial.
alter table historial drop constraint historial_accion_del_catalogo;
alter table historial add constraint historial_accion_del_catalogo check (accion in (
  'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA',
  'CLAVE_RESTABLECIDA', 'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA',
  'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
  'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO',
  'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA',
  'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO',
  'DOCUMENTO_RESTAURADO', 'DOCUMENTO_PURGADO', 'RESPALDO_GENERADO', 'VERSION_SUBIDA', 'VERSION_RESTAURADA',
  'LISTADO_EXPORTADO'
));
