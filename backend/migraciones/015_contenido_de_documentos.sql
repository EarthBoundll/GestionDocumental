-- 015 · El contenido de los documentos (D45).
--
-- El texto que ya trae el archivo vigente de cada documento (un PDF con capa de texto, un Word o un Excel),
-- leído por la API al subirlo, sin IA ni OCR, y sus palabras clave. Va en la misma fila, así que la misma RLS
-- decide quién lo ve, también la de las categorías restringidas (D22). Solo del archivo vigente: las
-- versiones siguen siendo de solo inserción, y restaurar una vuelve a leer el archivo copiado.
--
-- Lo que ya existe nace «pendiente»: una tarea de la API lo lee en segundo plano (src/tareas/leer-contenido.ts).

alter table documentos
  add column contenido text,
  add column contenido_estado text not null default 'pendiente'
    constraint documentos_contenido_estado check (contenido_estado in ('pendiente', 'leido', 'sin_texto', 'no_admitido', 'ilegible')),
  -- {"datos": [{"tipo": "ruc", "valor": "20…"}, …], "palabras": ["casaca", …]}
  add column palabras_clave jsonb,
  -- Cuánto se lee de cada archivo lo limita la API (20.000 caracteres); esto impide que otra vía guarde más.
  add constraint documentos_contenido_largo check (length(contenido) <= 20000);

-- El contenido entra en la búsqueda por la raíz de cada palabra, en su propia columna: la de la 014 (nombre,
-- archivo y descripción) queda igual de chica. Si fuera una sola, cada búsqueda descomprimiría unas trescientas
-- palabras por documento, también para encontrarlo por su nombre: con 50.000 documentos la búsqueda por nombre
-- tardaba casi el triple (docs/evidencias/prueba-de-carga.md). Sin posiciones (strip): no se usa para
-- ordenar, solo para saber si una palabra está. No entra en busqueda_texto: buscar fragmentos con LIKE en páginas enteras
-- recorrería megas en cada consulta, y la RLS no deja usar índices (D42).
alter table documentos add column busqueda_contenido tsvector generated always as (
  strip(to_tsvector('spanish', regexp_replace(normalizar(coalesce(contenido, '')), '[^a-z0-9]+', ' ', 'g')))
) stored;

-- La tarea de lectura busca lo pendiente de cada empresa sin recorrer todos sus documentos.
create index documentos_contenido_pendiente on documentos (empresa_id) where contenido_estado = 'pendiente';
