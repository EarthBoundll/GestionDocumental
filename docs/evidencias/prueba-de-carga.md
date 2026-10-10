# Prueba de carga: 50.000 documentos

Generado por `npm run informe:carga` (backend) el 9 de octubre de 2026, 8:31 p. m., hora de Lima.

**Pregunta.** ¿El listado y la búsqueda siguen por debajo de 1 s (RNF05, indicador 7) cuando una empresa
tiene 50,000 documentos, con categorías restringidas y otra empresa en las mismas tablas?

**Resultado: 23 de 23 escenarios con el percentil 95 dentro de su umbral:** 1 s para listar
y buscar (RNF05) y 5 s para las dos exportaciones, que descargan de una vez todo lo filtrado.

## Los datos

- Empresa medida: 50,000 documentos de un taller textil (facturas, guías, órdenes de compra,
  planillas…) repartidos en 8 categorías, dos de ellas restringidas, con fechas de tres años y medio, su
  versión 1, uno de cada 7 como foto, uno de cada 10 con su solicitud de aprobación y uno de cada 50 en la papelera; 200,000 asientos de historial; 11 personas.
- Otra empresa con 10,000 documentos en las mismas tablas.
- Quien mide: la **usuaria** ve una de las dos categorías restringidas, así que la RLS evalúa las dos
  ramas (D22); la **administradora** las ve todas. Carga de los datos: 18 s.

## Cómo se mide

Cada escenario es una petición real a la API (autenticación, sesión comprobada en la base, RLS,
consulta, registro en el historial de la búsqueda y JSON), 3 veces para calentar y 30
medidas. No incluye la red ni el navegador: es el tiempo del servidor, la parte que crece con los datos.
Equipo: 4 núcleos (Intel(R) Xeon(R) Processor @ 2.80GHz), 16 GB, Node v22.22.0,
PostgreSQL 17 local.

En producción el servidor es más lento (Render gratuito comparte CPU) y se suma la red hasta Supabase y
hasta el navegador. Por eso el indicador 7 de la evaluación se mide en el navegador de cada participante
(`docs/08-indicadores.md` §7); esta prueba responde otra pregunta: si el volumen de datos, por sí
solo, pone en riesgo el umbral.

## Resultados

| Escenario | Quién | Resultados | Mediana | Percentil 95 | Máximo | Umbral | Cumple |
|---|---|---:|---:|---:|---:|---:|---|
| Listado inicial: los 20 más recientes | usuaria | 42,750 | 12 ms | 15 ms | 18 ms | 1 s | Sí |
| Listado inicial: los 20 más recientes | administradora | 49,000 | 15 ms | 20 ms | 21 ms | 1 s | Sí |
| Búsqueda por nombre, sin tildes («guia de remision») | usuaria | 6,000 | 98 ms | 131 ms | 141 ms | 1 s | Sí |
| Búsqueda de un documento concreto («N° 031416») | usuaria | 1 | 74 ms | 97 ms | 100 ms | 1 s | Sí |
| El mismo, de una categoría restringida sin acceso («N° 031415») | usuaria | 0 | 75 ms | 112 ms | 117 ms | 1 s | Sí |
| Filtro por categoría (Facturas) | usuaria | 6,000 | 9 ms | 18 ms | 21 ms | 1 s | Sí |
| Filtro por categoría restringida con acceso (Planillas) | usuaria | 6,000 | 10 ms | 13 ms | 13 ms | 1 s | Sí |
| Filtro por fechas (un trimestre) | usuaria | 2,808 | 14 ms | 21 ms | 21 ms | 1 s | Sí |
| Nombre, categoría y fechas a la vez | usuaria | 534 | 30 ms | 41 ms | 42 ms | 1 s | Sí |
| Ordenado por nombre | usuaria | 42,750 | 56 ms | 98 ms | 111 ms | 1 s | Sí |
| Por palabras y su raíz, por relevancia («facturas textiles») | usuaria | 2,000 | 87 ms | 110 ms | 124 ms | 1 s | Sí |
| Solo en la descripción («medicion carga») | usuaria | 14,250 | 133 ms | 162 ms | 170 ms | 1 s | Sí |
| Con errores de escritura: segunda pasada por parecido («factrua textiles») | usuaria | 2,000 | 500 ms | 547 ms | 549 ms | 1 s | Sí |
| Sugerencias mientras se escribe («guia rem») | usuaria | 5 | 47 ms | 67 ms | 74 ms | 1 s | Sí |
| Sugerencias de un documento concreto («031416») | usuaria | 1 | 37 ms | 46 ms | 55 ms | 1 s | Sí |
| Filtro por estado de aprobación (pendientes) | usuaria | 1,250 | 48 ms | 54 ms | 67 ms | 1 s | Sí |
| Filtro por tipo (fotos) | usuaria | 6,107 | 32 ms | 44 ms | 46 ms | 1 s | Sí |
| Texto, tipo, estado y fecha de subida a la vez | usuaria | 0 | 315 ms | 359 ms | 360 ms | 1 s | Sí |
| Página 500 del listado | usuaria | 42,750 | 64 ms | 78 ms | 89 ms | 1 s | Sí |
| Historial: primera página | administradora | 200,435 | 27 ms | 30 ms | 30 ms | 1 s | Sí |
| Historial filtrado por una semana | administradora | 2,016 | 9 ms | 15 ms | 23 ms | 1 s | Sí |
| Historial imprimible: seis días enteros | administradora | 1,728 | 37 ms | 44 ms | 44 ms | 5 s | Sí |
| Listado documental completo en CSV | administradora | 49,000 | 515 ms | 847 ms | 847 ms | 5 s | Sí |

## Lo que encontró

La primera ejecución, el 7 de octubre de 2026, se hizo con la política de visibilidad de la migración 004, que
llamaba a `puede_ver_categoria()` en cada fila. Una función `SECURITY DEFINER` no se integra en la consulta,
y cada página la evaluaba dos veces por documento (para el total y para la página):

| Escenario | Con la política de la 004 (mediana) | Con la de la 010 (mediana) |
|---|---:|---:|
| Listado inicial de la usuaria | 1948 ms | 12 ms |
| Listado inicial de la administradora | 925 ms | 15 ms |
| Búsqueda por nombre de la usuaria | 3846 ms (`guia remision`) | 98 ms |

La migración 010 calcula una sola vez por consulta qué categorías ve quien pregunta (`categorias_visibles()`, un
InitPlan) y cada fila solo se compara con esa lista; decide lo mismo que antes (D31).

### La búsqueda de la migración 014 (D42)

Antes de la 014, la búsqueda quitaba tildes al nombre de cada documento en cada consulta (`normalizar(nombre)`, que
llama a `unaccent`), y el índice de trigramas no servía: con la RLS activa, `LIKE` no es *leakproof* y PostgreSQL no
lo evalúa antes que las políticas. La 014 guarda el texto ya normalizado en columnas generadas y quitó ese índice, que
solo costaba en cada escritura. La búsqueda ahora mira también el archivo, la descripción y la categoría, y la raíz
de cada palabra, y aun así:

| Escenario | Antes de la 014 (7 de octubre, mediana) | Con la 014 (mediana) |
|---|---:|---:|
| Búsqueda por nombre, sin tildes («guia de remision») | 282 ms | 98 ms |
| Búsqueda de un documento concreto («N° 031416») | 285 ms | 74 ms |
| Ordenado por nombre | 159 ms | 56 ms |
| Listado documental completo en CSV | 791 ms | 515 ms |

Sigue sin usar índices con la RLS (`@@` y `LIKE` tampoco son *leakproof*): recorre los documentos visibles de la
empresa. Por eso no se añadió ninguno; la segunda pasada, por similitud de trigramas, es la más cara y solo corre cuando
la exacta no encontró nada. Si un día hiciera falta, la salida es una función que busque los identificadores con un
índice dentro de la empresa activa.

La primera medición de la 014, el 10 de octubre de 2026, encontró dos cosas que se corrigieron antes de publicarla:

- Buscar un número que no está («N° 031415», de una categoría que la usuaria no ve) pasaba a la búsqueda por parecido
  y devolvía 86 documentos con números vecinos, en 949 ms. Un número con un dígito distinto es otro documento: ahora
  solo las palabras de letras admiten errores de escritura, y esa búsqueda no devuelve nada, en unos 75 ms.
- La búsqueda por parecido sobre el nombre, el archivo y la descripción tardaba más de 1 s. Ahora compara solo con el
  nombre, que es lo que se escribe de memoria, y tarda la mitad.

## Planes de ejecución

Las mismas consultas que ejecuta la API, con el rol `app_empresa` y la identidad de la usuaria: es decir,
con la RLS aplicada.

<details>
<summary>Listado inicial de la usuaria (total): Execution Time: 8.733 ms</summary>

```
Aggregate (actual time=8.702..8.703 rows=1 loops=1)
  Buffers: shared hit=41
  InitPlan 1
    ->  Result (actual time=0.380..0.380 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=0.445..6.901 rows=42750 loops=1)
        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
        Buffers: shared hit=41
        ->  Index Only Scan using documentos_por_categoria on documentos d (actual time=0.397..3.810 rows=42750 loops=1)
              Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
              Heap Fetches: 0
              Buffers: shared hit=41
Planning Time: 0.123 ms
Execution Time: 8.733 ms
```

</details>

<details>
<summary>Listado inicial de la usuaria (página): Execution Time: 1.127 ms</summary>

```
Limit (actual time=1.085..1.089 rows=20 loops=1)
  Buffers: shared hit=48
  InitPlan 1
    ->  Result (actual time=0.347..0.347 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Incremental Sort (actual time=1.084..1.086 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Presorted Key: d.creado_en
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 30kB  Peak Memory: 30kB
        Buffers: shared hit=48
        ->  Result (actual time=0.992..1.045 rows=21 loops=1)
              One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
              Buffers: shared hit=48
              ->  Nested Loop (actual time=0.961..1.011 rows=21 loops=1)
                    Join Filter: (c.id = d.categoria_id)
                    Rows Removed by Join Filter: 105
                    Buffers: shared hit=48
                    ->  Nested Loop (actual time=0.373..0.406 rows=21 loops=1)
                          Buffers: shared hit=28
                          ->  Index Scan using documentos_recientes on documentos d (actual time=0.364..0.372 rows=21 loops=1)
                                Index Cond: (empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                Filter: (categoria_id = ANY ((InitPlan 1).col1))
                                Rows Removed by Filter: 3
                                Buffers: shared hit=8
                          ->  Memoize (actual time=0.001..0.001 rows=1 loops=21)
                                Cache Key: d.subido_por
                                Cache Mode: logical
                                Hits: 11  Misses: 10  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                Buffers: shared hit=20
                                ->  Index Scan using usuarios_id_empresa on usuarios u (actual time=0.001..0.001 rows=1 loops=10)
                                      Index Cond: ((id = d.subido_por) AND (empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.010..0.028 rows=6 loops=21)
                          Buffers: shared hit=20
                          ->  Seq Scan on categorias c (actual time=0.209..0.580 rows=9 loops=1)
                                Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id))
                                Buffers: shared hit=20
Planning:
  Buffers: shared hit=8
Planning Time: 0.308 ms
Execution Time: 1.127 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (total): Execution Time: 34.757 ms</summary>

```
Aggregate (actual time=34.696..34.700 rows=1 loops=1)
  Buffers: shared hit=3562
  InitPlan 3
    ->  Result (actual time=0.344..0.344 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=3.882..34.380 rows=6000 loops=1)
        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
        Buffers: shared hit=3562
        ->  Bitmap Heap Scan on documentos d (actual time=3.842..33.835 rows=6000 loops=1)
              Recheck Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%guia%'::text) OR (busqueda @@ '''gui'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%remision%'::text) OR (busqueda @@ '''remision'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 36750
              Heap Blocks: exact=3499
              Buffers: shared hit=3562
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.739..2.739 rows=42750 loops=1)
                    Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.458..0.676 rows=1 loops=1)
                      One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.423..0.640 rows=1 loops=1)
                            Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%guia%'::text))
                            Rows Removed by Filter: 17
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (never executed)
                      One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                      ->  Seq Scan on categorias ca_1 (never executed)
                            Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%remision%'::text))
Planning Time: 0.223 ms
Execution Time: 34.757 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (página): Execution Time: 51.047 ms</summary>

```
Limit (actual time=50.950..50.959 rows=20 loops=1)
  Buffers: shared hit=3586
  InitPlan 3
    ->  Result (actual time=0.345..0.346 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=50.948..50.954 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'guia de remision'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'guia de remision%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%guia%'::text) AND (d.busqueda_nombre ~~ '%remision%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*'::tsquery))) THEN 5 ELSE 6 END), (ts_rank(d.busqueda, '''gui'':* | ''remision'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=3586
        ->  Result (actual time=4.513..38.678 rows=6000 loops=1)
              One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
              Buffers: shared hit=3586
              ->  Hash Join (actual time=4.469..35.899 rows=6000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=3586
                    ->  Hash Join (actual time=4.454..34.577 rows=6000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=3585
                          ->  Bitmap Heap Scan on documentos d (actual time=3.794..32.439 rows=6000 loops=1)
                                Recheck Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%guia%'::text) OR (busqueda @@ '''gui'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%remision%'::text) OR (busqueda @@ '''remision'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 36750
                                Heap Blocks: exact=3499
                                Buffers: shared hit=3562
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.604..2.605 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.565..0.782 rows=1 loops=1)
                                        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.533..0.749 rows=1 loops=1)
                                              Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%guia%'::text))
                                              Rows Removed by Filter: 17
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (never executed)
                                        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                        ->  Seq Scan on categorias ca_1 (never executed)
                                              Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%remision%'::text))
                          ->  Hash (actual time=0.655..0.656 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.288..0.652 rows=9 loops=1)
                                      Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.011..0.011 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.006..0.008 rows=11 loops=1)
                                Filter: (empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=8
Planning Time: 0.499 ms
Execution Time: 51.047 ms
```

</details>

<details>
<summary>Búsqueda por relevancia de la usuaria (total): Execution Time: 35.059 ms</summary>

```
Aggregate (actual time=34.997..35.000 rows=1 loops=1)
  Buffers: shared hit=3585
  InitPlan 3
    ->  Result (actual time=0.303..0.303 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=4.799..34.872 rows=2000 loops=1)
        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
        Buffers: shared hit=3585
        ->  Bitmap Heap Scan on documentos d (actual time=4.760..34.661 rows=2000 loops=1)
              Recheck Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%facturas%'::text) OR (busqueda @@ '''factur'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 40750
              Heap Blocks: exact=3499
              Buffers: shared hit=3585
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.567..2.568 rows=42750 loops=1)
                    Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.316..1.079 rows=2 loops=1)
                      One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.277..1.039 rows=2 loops=1)
                            Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%facturas%'::text))
                            Rows Removed by Filter: 16
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (actual time=0.618..0.618 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca_1 (actual time=0.603..0.603 rows=0 loops=1)
                            Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
Planning Time: 0.277 ms
Execution Time: 35.059 ms
```

</details>

<details>
<summary>Búsqueda por relevancia de la usuaria (página): Execution Time: 43.049 ms</summary>

```
Limit (actual time=42.946..42.957 rows=20 loops=1)
  Buffers: shared hit=3609
  InitPlan 3
    ->  Result (actual time=0.249..0.250 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=42.944..42.952 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'facturas textiles'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'facturas textiles%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%facturas%'::text) AND (d.busqueda_nombre ~~ '%textiles%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*'::tsquery))) THEN 5 ELSE 6 END), (ts_rank(d.busqueda, '''factur'':* | ''textil'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=3609
        ->  Result (actual time=5.064..38.983 rows=2000 loops=1)
              One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
              Buffers: shared hit=3609
              ->  Hash Join (actual time=5.012..37.299 rows=2000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=3609
                    ->  Hash Join (actual time=4.999..36.849 rows=2000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=3608
                          ->  Bitmap Heap Scan on documentos d (actual time=4.358..35.662 rows=2000 loops=1)
                                Recheck Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%facturas%'::text) OR (busqueda @@ '''factur'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 40750
                                Heap Blocks: exact=3499
                                Buffers: shared hit=3585
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.596..2.597 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.309..0.686 rows=2 loops=1)
                                        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.270..0.646 rows=2 loops=1)
                                              Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%facturas%'::text))
                                              Rows Removed by Filter: 16
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (actual time=0.623..0.624 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca_1 (actual time=0.609..0.609 rows=0 loops=1)
                                              Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                          ->  Hash (actual time=0.636..0.637 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.240..0.632 rows=9 loops=1)
                                      Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.010..0.011 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.005..0.007 rows=11 loops=1)
                                Filter: (empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=8
Planning Time: 0.533 ms
Execution Time: 43.049 ms
```

</details>

<details>
<summary>Segunda pasada por parecido de la usuaria (total): Execution Time: 196.740 ms</summary>

```
Aggregate (actual time=196.669..196.674 rows=1 loops=1)
  Buffers: shared hit=3585
  InitPlan 3
    ->  Result (actual time=0.295..0.296 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=4.570..196.484 rows=2000 loops=1)
        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
        Buffers: shared hit=3585
        ->  Bitmap Heap Scan on documentos d (actual time=4.526..196.219 rows=2000 loops=1)
              Recheck Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%factrua%'::text) OR (busqueda @@ '''factru'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1)) OR (extensions.word_similarity('factrua'::text, busqueda_nombre) >= '0.5'::double precision)) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1)) OR (extensions.word_similarity('textiles'::text, busqueda_nombre) >= '0.5'::double precision)))
              Rows Removed by Filter: 40750
              Heap Blocks: exact=3499
              Buffers: shared hit=3585
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.628..2.629 rows=42750 loops=1)
                    Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.724..0.725 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.688..0.688 rows=0 loops=1)
                            Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%factrua%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (actual time=0.636..0.636 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca_1 (actual time=0.620..0.620 rows=0 loops=1)
                            Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
Planning Time: 0.251 ms
Execution Time: 196.740 ms
```

</details>

<details>
<summary>Segunda pasada por parecido de la usuaria (página): Execution Time: 222.071 ms</summary>

```
Limit (actual time=221.971..221.980 rows=20 loops=1)
  Buffers: shared hit=3609
  InitPlan 3
    ->  Result (actual time=0.256..0.257 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=221.969..221.975 rows=20 loops=1)
        Sort Key: ((extensions.word_similarity('factrua'::text, d.busqueda_nombre) + extensions.word_similarity('textiles'::text, d.busqueda_nombre))) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=3609
        ->  Result (actual time=5.059..219.438 rows=2000 loops=1)
              One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
              Buffers: shared hit=3609
              ->  Hash Join (actual time=5.004..204.970 rows=2000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=3609
                    ->  Hash Join (actual time=4.987..204.425 rows=2000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=3608
                          ->  Bitmap Heap Scan on documentos d (actual time=4.324..203.066 rows=2000 loops=1)
                                Recheck Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%factrua%'::text) OR (busqueda @@ '''factru'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1)) OR (extensions.word_similarity('factrua'::text, busqueda_nombre) >= '0.5'::double precision)) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1)) OR (extensions.word_similarity('textiles'::text, busqueda_nombre) >= '0.5'::double precision)))
                                Rows Removed by Filter: 40750
                                Heap Blocks: exact=3499
                                Buffers: shared hit=3585
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.499..2.499 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.639..0.639 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.605..0.606 rows=0 loops=1)
                                              Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%factrua%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (actual time=0.635..0.635 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca_1 (actual time=0.592..0.592 rows=0 loops=1)
                                              Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                          ->  Hash (actual time=0.658..0.659 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.250..0.653 rows=9 loops=1)
                                      Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.013..0.013 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.006..0.009 rows=11 loops=1)
                                Filter: (empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=8
Planning Time: 0.480 ms
Execution Time: 222.071 ms
```

</details>

<details>
<summary>Filtro por estado de la usuaria (total): Execution Time: 23.316 ms</summary>

```
Aggregate (actual time=23.259..23.264 rows=1 loops=1)
  Buffers: shared hit=3624
  InitPlan 1
    ->  Result (actual time=0.454..0.454 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=7.339..23.189 rows=1250 loops=1)
        One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
        Buffers: shared hit=3624
        ->  Hash Left Join (actual time=7.298..23.033 rows=1250 loops=1)
              Hash Cond: (d.id = ultima.documento_id)
              Filter: ((COALESCE(ultima.estado, 'sin_solicitud'::character varying))::text = 'pendiente'::text)
              Rows Removed by Filter: 41500
              Buffers: shared hit=3624
              ->  Bitmap Heap Scan on documentos d (actual time=3.161..12.958 rows=42750 loops=1)
                    Recheck Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
                    Heap Blocks: exact=3499
                    Buffers: shared hit=3539
                    ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.740..2.740 rows=42750 loops=1)
                          Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                          Buffers: shared hit=40
              ->  Hash (actual time=4.114..4.116 rows=4500 loops=1)
                    Buckets: 8192  Batches: 1  Memory Usage: 318kB
                    Buffers: shared hit=85
                    ->  Subquery Scan on ultima (actual time=2.173..3.474 rows=4500 loops=1)
                          Buffers: shared hit=85
                          ->  Unique (actual time=2.172..3.012 rows=4500 loops=1)
                                Buffers: shared hit=85
                                ->  Sort (actual time=2.171..2.414 rows=4500 loops=1)
                                      Sort Key: s.documento_id, s.creada_en DESC
                                      Sort Method: quicksort  Memory: 439kB
                                      Buffers: shared hit=85
                                      ->  Result (actual time=0.051..1.184 rows=4500 loops=1)
                                            One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                            Buffers: shared hit=85
                                            ->  Seq Scan on solicitudes s (actual time=0.008..0.757 rows=4500 loops=1)
                                                  Filter: (empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                                  Buffers: shared hit=85
Planning Time: 0.207 ms
Execution Time: 23.316 ms
```

</details>

<details>
<summary>Filtro por estado de la usuaria (página): Execution Time: 27.201 ms</summary>

```
Limit (actual time=27.125..27.137 rows=20 loops=1)
  Buffers: shared hit=3645
  InitPlan 1
    ->  Result (actual time=0.296..0.297 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=27.123..27.132 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=3645
        ->  Result (actual time=7.890..26.599 rows=1250 loops=1)
              One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
              Buffers: shared hit=3645
              ->  Nested Loop (actual time=7.850..26.413 rows=1250 loops=1)
                    Join Filter: (u.id = d.subido_por)
                    Rows Removed by Join Filter: 6250
                    Buffers: shared hit=3645
                    ->  Nested Loop (actual time=7.842..25.315 rows=1250 loops=1)
                          Join Filter: (c.id = d.categoria_id)
                          Rows Removed by Join Filter: 6250
                          Buffers: shared hit=3644
                          ->  Hash Left Join (actual time=7.197..23.539 rows=1250 loops=1)
                                Hash Cond: (d.id = ultima.documento_id)
                                Filter: ((COALESCE(ultima.estado, 'sin_solicitud'::character varying))::text = 'pendiente'::text)
                                Rows Removed by Filter: 41500
                                Buffers: shared hit=3624
                                ->  Bitmap Heap Scan on documentos d (actual time=3.035..12.681 rows=42750 loops=1)
                                      Recheck Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
                                      Heap Blocks: exact=3499
                                      Buffers: shared hit=3539
                                      ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.621..2.621 rows=42750 loops=1)
                                            Index Cond: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                                            Buffers: shared hit=40
                                ->  Hash (actual time=4.141..4.144 rows=4500 loops=1)
                                      Buckets: 8192  Batches: 1  Memory Usage: 318kB
                                      Buffers: shared hit=85
                                      ->  Subquery Scan on ultima (actual time=2.250..3.530 rows=4500 loops=1)
                                            Buffers: shared hit=85
                                            ->  Unique (actual time=2.249..3.091 rows=4500 loops=1)
                                                  Buffers: shared hit=85
                                                  ->  Sort (actual time=2.248..2.512 rows=4500 loops=1)
                                                        Sort Key: s.documento_id, s.creada_en DESC
                                                        Sort Method: quicksort  Memory: 439kB
                                                        Buffers: shared hit=85
                                                        ->  Result (actual time=0.050..1.309 rows=4500 loops=1)
                                                              One-Time Filter: (empresa_actual() = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                                              Buffers: shared hit=85
                                                              ->  Seq Scan on solicitudes s (actual time=0.006..0.881 rows=4500 loops=1)
                                                                    Filter: (empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                                                    Buffers: shared hit=85
                          ->  Materialize (actual time=0.000..0.001 rows=6 loops=1250)
                                Buffers: shared hit=20
                                ->  Seq Scan on categorias c (actual time=0.292..0.637 rows=9 loops=1)
                                      Filter: ((empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid) AND puede_ver_categoria(id))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.000..0.000 rows=6 loops=1250)
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.004..0.006 rows=9 loops=1)
                                Filter: (empresa_id = 'd55f01ce-907d-4e42-9ae1-a8435d82513e'::uuid)
                                Rows Removed by Filter: 1
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=8
Planning Time: 0.531 ms
Execution Time: 27.201 ms
```

</details>
