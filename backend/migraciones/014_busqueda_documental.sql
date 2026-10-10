-- 014 · Búsqueda documental (D42).
--
-- Tres columnas generadas: la base las calcula al insertar o actualizar el documento, también cuando una
-- versión nueva cambia su archivo. Así la búsqueda deja de quitar tildes fila por fila (unaccent es lo
-- caro) y busca en el nombre, el nombre del archivo y la descripción, no solo en el nombre.
--
-- Todo va sin tildes, en minúsculas y con cualquier signo convertido en un espacio: «Factura_F001-0245.pdf»
-- queda «factura f001 0245 pdf», y cada palabra se puede encontrar por separado.

alter table documentos
  -- El nombre, palabra por palabra: para la coincidencia exacta, el comienzo y el orden alfabético.
  add column busqueda_nombre text generated always as (
    btrim(regexp_replace(normalizar(nombre), '[^a-z0-9]+', ' ', 'g'))
  ) stored,
  -- Nombre, archivo y descripción juntos: para encontrar una palabra a medias («contra» en «contrato»).
  add column busqueda_texto text generated always as (
    btrim(regexp_replace(normalizar(nombre || ' ' || archivo_nombre_original || ' ' || coalesce(descripcion, '')),
      '[^a-z0-9]+', ' ', 'g'))
  ) stored,
  -- Por la raíz de cada palabra en español («facturas» encuentra «factura»): el nombre y el archivo pesan
  -- más (A) que la descripción (B).
  add column busqueda tsvector generated always as (
    setweight(to_tsvector('spanish',
      regexp_replace(normalizar(nombre || ' ' || archivo_nombre_original), '[^a-z0-9]+', ' ', 'g')), 'A')
    || setweight(to_tsvector('spanish',
      regexp_replace(normalizar(coalesce(descripcion, '')), '[^a-z0-9]+', ' ', 'g')), 'B')
  ) stored;

-- La búsqueda ya no usa normalizar(nombre), y con la RLS activa el planificador no podía usar este índice
-- (LIKE no es «leakproof»): solo costaba en cada escritura.
drop index documentos_nombre_trigramas;
