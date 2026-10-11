# Prueba de carga: 50.000 documentos

Generado por `npm run informe:carga` (backend) el 11 de octubre de 2026, 10:34 a. m., hora de Lima.

**Pregunta.** ¿El listado y la búsqueda siguen por debajo de 1 s (RNF05, indicador 7) cuando una empresa
tiene 50,000 documentos, con categorías restringidas y otra empresa en las mismas tablas?

**Resultado: 28 de 28 escenarios con el percentil 95 dentro de su umbral:** 1 s para listar
y buscar (RNF05) y 5 s para las exportaciones (la hoja para imprimir, el CSV y el Excel), que descargan de una vez todo lo filtrado.

## Los datos

- Empresa medida: 50,000 documentos de un taller textil (facturas, guías, órdenes de compra,
  planillas…) repartidos en 8 categorías, dos de ellas restringidas, con fechas de tres años y medio, su
  versión 1, uno de cada 7 como foto, uno de cada 10 con su solicitud de aprobación y uno de cada 50 en la papelera; 200,000 asientos de historial; 11 personas.
- El texto de cada archivo que no es una foto (D45): unos 1.700 caracteres con el cliente, su RUC, dos prendas y
  cláusulas de entrega, pago y garantía, como lo dejaría la lectura al subirlo.
- Otra empresa con 10,000 documentos en las mismas tablas.
- Quien mide: la **usuaria** ve una de las dos categorías restringidas, así que la RLS evalúa las dos
  ramas (D22); la **administradora** las ve todas. Carga de los datos: 31 s.

## Cómo se mide

Cada escenario es una petición real a la API (autenticación, sesión comprobada en la base, RLS,
consulta, registro en el historial de la búsqueda y JSON), 3 veces para calentar y 30
medidas. No incluye la red ni el navegador: es el tiempo del servidor, la parte que crece con los datos.
Equipo: 4 núcleos (Intel(R) Xeon(R) Processor @ 2.10GHz), 16 GB, Node v22.22.0,
PostgreSQL 17 local.

En producción el servidor es más lento (Render gratuito comparte CPU) y se suma la red hasta Supabase y
hasta el navegador. Por eso el indicador 7 de la evaluación se mide en el navegador de cada participante
(`docs/08-indicadores.md` §7); esta prueba responde otra pregunta: si el volumen de datos, por sí
solo, pone en riesgo el umbral.

## Resultados

| Escenario | Quién | Resultados | Mediana | Percentil 95 | Máximo | Umbral | Cumple |
|---|---|---:|---:|---:|---:|---:|---|
| Listado inicial: los 20 más recientes | usuaria | 42,750 | 14 ms | 19 ms | 21 ms | 1 s | Sí |
| Listado inicial: los 20 más recientes | administradora | 49,000 | 16 ms | 21 ms | 44 ms | 1 s | Sí |
| Búsqueda por nombre, sin tildes («guia de remision») | usuaria | 6,000 | 136 ms | 170 ms | 314 ms | 1 s | Sí |
| Búsqueda de un documento concreto («N° 031416») | usuaria | 1 | 114 ms | 162 ms | 163 ms | 1 s | Sí |
| El mismo, de una categoría restringida sin acceso («N° 031415») | usuaria | 0 | 142 ms | 162 ms | 183 ms | 1 s | Sí |
| Filtro por categoría (Facturas) | usuaria | 6,000 | 12 ms | 16 ms | 28 ms | 1 s | Sí |
| Filtro por categoría restringida con acceso (Planillas) | usuaria | 6,000 | 10 ms | 15 ms | 20 ms | 1 s | Sí |
| Filtro por fechas (un trimestre) | usuaria | 2,808 | 17 ms | 28 ms | 39 ms | 1 s | Sí |
| Nombre, categoría y fechas a la vez | usuaria | 534 | 43 ms | 50 ms | 62 ms | 1 s | Sí |
| Ordenado por nombre | usuaria | 42,750 | 75 ms | 94 ms | 94 ms | 1 s | Sí |
| Por palabras y su raíz, por relevancia («facturas textiles») | usuaria | 2,000 | 129 ms | 167 ms | 178 ms | 1 s | Sí |
| Solo en la descripción («medicion carga») | usuaria | 14,250 | 176 ms | 204 ms | 209 ms | 1 s | Sí |
| Con errores de escritura: segunda pasada por parecido («factrua textiles») | usuaria | 2,000 | 573 ms | 699 ms | 712 ms | 1 s | Sí |
| Dentro del archivo, muchas coincidencias («chompa alpaca») | usuaria | 9,267 | 167 ms | 218 ms | 233 ms | 1 s | Sí |
| Dentro del archivo, un RUC que está en uno solo («20248791223») | usuaria | 1 | 115 ms | 145 ms | 163 ms | 1 s | Sí |
| Sugerencias mientras se escribe («guia rem») | usuaria | 5 | 66 ms | 75 ms | 89 ms | 1 s | Sí |
| Sugerencias de un documento concreto («031416») | usuaria | 1 | 57 ms | 74 ms | 74 ms | 1 s | Sí |
| Filtro por estado de aprobación (pendientes) | usuaria | 1,250 | 71 ms | 91 ms | 93 ms | 1 s | Sí |
| Filtro por tipo (fotos) | usuaria | 6,107 | 46 ms | 56 ms | 64 ms | 1 s | Sí |
| Texto, tipo, estado y fecha de subida a la vez | usuaria | 0 | 378 ms | 443 ms | 484 ms | 1 s | Sí |
| Página 500 del listado | usuaria | 42,750 | 77 ms | 103 ms | 135 ms | 1 s | Sí |
| Historial: primera página | administradora | 200,021 | 23 ms | 35 ms | 42 ms | 1 s | Sí |
| Historial: lo importante, primera página | administradora | 100,004 | 51 ms | 70 ms | 75 ms | 1 s | Sí |
| Historial: la rutina, primera página | administradora | 100,017 | 50 ms | 67 ms | 68 ms | 1 s | Sí |
| Historial filtrado por una semana | administradora | 2,016 | 10 ms | 12 ms | 14 ms | 1 s | Sí |
| Historial imprimible: seis días enteros | administradora | 1,728 | 33 ms | 49 ms | 49 ms | 5 s | Sí |
| Listado documental completo en CSV | administradora | 49,000 | 440 ms | 484 ms | 484 ms | 5 s | Sí |
| Listado documental completo en Excel | administradora | — | 1426 ms | 1479 ms | 1479 ms | 5 s | Sí |

## Lo que encontró

La primera ejecución, el 7 de octubre de 2026, se hizo con la política de visibilidad de la migración 004, que
llamaba a `puede_ver_categoria()` en cada fila. Una función `SECURITY DEFINER` no se integra en la consulta,
y cada página la evaluaba dos veces por documento (para el total y para la página):

| Escenario | Con la política de la 004 (mediana) | Con la de la 010 (mediana) |
|---|---:|---:|
| Listado inicial de la usuaria | 1948 ms | 14 ms |
| Listado inicial de la administradora | 925 ms | 16 ms |
| Búsqueda por nombre de la usuaria | 3846 ms (`guia remision`) | 136 ms |

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
| Búsqueda por nombre, sin tildes («guia de remision») | 282 ms | 136 ms |
| Búsqueda de un documento concreto («N° 031416») | 285 ms | 114 ms |
| Ordenado por nombre | 159 ms | 75 ms |
| Listado documental completo en CSV | 791 ms | 440 ms |

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

### El texto de los archivos (D45)

Desde la migración 015 la búsqueda mira también lo que dice cada archivo. La primera versión lo puso, con el peso más
bajo, en la misma columna `busqueda` que ya se recorría: cada documento pasó de unas diez palabras a unas trescientas,
y PostgreSQL las descomprimía varias veces por fila (al filtrar, al calcular el nivel y al ordenar), también para
encontrar un documento por su nombre. Con 50.000 documentos, la búsqueda por nombre se triplicó (de 100 a 293 ms) y la
segunda pasada por parecido llegó a pasar de 1 s. Antes de publicarla, el texto pasó a su propia columna (`busqueda_contenido`, sin
posiciones), que solo se mira en las filas donde el nombre, la descripción y la categoría no coincidieron. Medianas,
con los mismos datos y los mismos resultados en las dos versiones (11 de octubre de 2026):

| Escenario | Sin el texto | Texto en la misma columna | Texto en su columna (ahora) |
|---|---:|---:|---:|
| Búsqueda por nombre, sin tildes («guia de remision») | 100 ms | 293 ms | 136 ms |
| Búsqueda de un documento concreto («N° 031416») | 79 ms | 276 ms | 114 ms |
| Por palabras y su raíz, por relevancia («facturas textiles») | 91 ms | 323 ms | 129 ms |
| Solo en la descripción («medicion carga») | 135 ms | 344 ms | 176 ms |
| Con errores de escritura: segunda pasada por parecido («factrua textiles») | 533 ms | 905 ms (máximo 1018 ms) | 573 ms |
| Dentro del archivo, muchas coincidencias («chompa alpaca») | — | 438 ms | 167 ms |
| Dentro del archivo, un RUC que está en uno solo | — | 288 ms | 115 ms |
| Sugerencias mientras se escribe («guia rem») | 50 ms | 154 ms | 66 ms |

«Sin el texto» es la ejecución anterior de este informe, con los mismos documentos sin su contenido. Lo que cuesta
todavía el contenido es leer su columna en los documentos donde lo demás no coincidió; dentro de él, las coincidencias
empatan y va primero lo más reciente, así que no hay que leerlo de nuevo para ordenar.

## Planes de ejecución

Las mismas consultas que ejecuta la API, con el rol `app_empresa` y la identidad de la usuaria: es decir,
con la RLS aplicada.

<details>
<summary>Listado inicial de la usuaria (total): Execution Time: 13.488 ms</summary>

```
Aggregate (actual time=13.342..13.344 rows=1 loops=1)
  Buffers: shared hit=41
  InitPlan 1
    ->  Result (actual time=0.367..0.368 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=0.449..11.061 rows=42750 loops=1)
        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
        Buffers: shared hit=41
        ->  Index Only Scan using documentos_por_categoria on documentos d (actual time=0.390..5.854 rows=42750 loops=1)
              Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
              Heap Fetches: 0
              Buffers: shared hit=41
Planning:
  Buffers: shared hit=1
Planning Time: 0.160 ms
Execution Time: 13.488 ms
```

</details>

<details>
<summary>Listado inicial de la usuaria (página): Execution Time: 1.547 ms</summary>

```
Limit (actual time=1.488..1.493 rows=20 loops=1)
  Buffers: shared hit=53
  InitPlan 1
    ->  Result (actual time=0.395..0.395 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Incremental Sort (actual time=1.486..1.488 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Presorted Key: d.creado_en
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 30kB  Peak Memory: 30kB
        Buffers: shared hit=53
        ->  Result (actual time=1.381..1.464 rows=21 loops=1)
              One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
              Buffers: shared hit=53
              ->  Nested Loop (actual time=1.327..1.407 rows=21 loops=1)
                    Join Filter: (c.id = d.categoria_id)
                    Rows Removed by Join Filter: 105
                    Buffers: shared hit=53
                    ->  Nested Loop (actual time=0.478..0.537 rows=21 loops=1)
                          Buffers: shared hit=33
                          ->  Index Scan using documentos_recientes on documentos d (actual time=0.428..0.452 rows=21 loops=1)
                                Index Cond: (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                Filter: (categoria_id = ANY ((InitPlan 1).col1))
                                Rows Removed by Filter: 3
                                Buffers: shared hit=13
                          ->  Memoize (actual time=0.003..0.003 rows=1 loops=21)
                                Cache Key: d.subido_por
                                Cache Mode: logical
                                Hits: 11  Misses: 10  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                Buffers: shared hit=20
                                ->  Index Scan using usuarios_id_empresa on usuarios u (actual time=0.005..0.005 rows=1 loops=10)
                                      Index Cond: ((id = d.subido_por) AND (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.018..0.037 rows=6 loops=21)
                          Buffers: shared hit=20
                          ->  Seq Scan on categorias c (actual time=0.368..0.772 rows=9 loops=1)
                                Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id))
                                Buffers: shared hit=20
Planning:
  Buffers: shared hit=9
Planning Time: 0.424 ms
Execution Time: 1.547 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (total): Execution Time: 66.866 ms</summary>

```
Aggregate (actual time=66.780..66.788 rows=1 loops=1)
  Buffers: shared hit=7801
  InitPlan 3
    ->  Result (actual time=0.327..0.328 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=7.372..66.262 rows=6000 loops=1)
        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
        Buffers: shared hit=7801
        ->  Bitmap Heap Scan on documentos d (actual time=7.322..65.464 rows=6000 loops=1)
              Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%guia%'::text) OR (busqueda @@ '''gui'':*'::tsquery) OR (busqueda_contenido @@ '''gui'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%remision%'::text) OR (busqueda @@ '''remision'':*'::tsquery) OR (busqueda_contenido @@ '''remision'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 36750
              Heap Blocks: exact=7738
              Buffers: shared hit=7801
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.980..3.981 rows=42750 loops=1)
                    Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=1.315..1.755 rows=1 loops=1)
                      One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=1.246..1.683 rows=1 loops=1)
                            Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%guia%'::text))
                            Rows Removed by Filter: 17
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (never executed)
                      One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                      ->  Seq Scan on categorias ca_1 (never executed)
                            Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%remision%'::text))
Planning:
  Buffers: shared hit=1
Planning Time: 0.274 ms
Execution Time: 66.866 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (página): Execution Time: 79.607 ms</summary>

```
Limit (actual time=79.432..79.449 rows=20 loops=1)
  Buffers: shared hit=7825
  InitPlan 3
    ->  Result (actual time=0.285..0.286 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=79.428..79.440 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'guia de remision'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'guia de remision%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%guia%'::text) AND (d.busqueda_nombre ~~ '%remision%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*'::tsquery))) THEN 5 WHEN (((d.busqueda_texto ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*'::tsquery) OR (d.busqueda_contenido @@ '''gui'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*'::tsquery) OR (d.busqueda_contenido @@ '''remision'':*'::tsquery))) THEN 6 ELSE 7 END), (ts_rank(d.busqueda, '''gui'':* | ''remision'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7825
        ->  Result (actual time=7.511..65.635 rows=6000 loops=1)
              One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
              Buffers: shared hit=7825
              ->  Hash Join (actual time=7.432..62.830 rows=6000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=7825
                    ->  Hash Join (actual time=7.403..61.304 rows=6000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=7824
                          ->  Bitmap Heap Scan on documentos d (actual time=6.494..58.460 rows=6000 loops=1)
                                Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%guia%'::text) OR (busqueda @@ '''gui'':*'::tsquery) OR (busqueda_contenido @@ '''gui'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%remision%'::text) OR (busqueda @@ '''remision'':*'::tsquery) OR (busqueda_contenido @@ '''remision'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 36750
                                Heap Blocks: exact=7738
                                Buffers: shared hit=7801
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=4.245..4.245 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.628..0.797 rows=1 loops=1)
                                        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.532..0.700 rows=1 loops=1)
                                              Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%guia%'::text))
                                              Rows Removed by Filter: 17
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (never executed)
                                        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                        ->  Seq Scan on categorias ca_1 (never executed)
                                              Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%remision%'::text))
                          ->  Hash (actual time=0.899..0.900 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.393..0.893 rows=9 loops=1)
                                      Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.022..0.023 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.015..0.018 rows=11 loops=1)
                                Filter: (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.745 ms
Execution Time: 79.607 ms
```

</details>

<details>
<summary>Búsqueda por relevancia de la usuaria (total): Execution Time: 53.044 ms</summary>

```
Aggregate (actual time=52.955..52.962 rows=1 loops=1)
  Buffers: shared hit=7824
  InitPlan 3
    ->  Result (actual time=0.315..0.316 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=6.158..52.809 rows=2000 loops=1)
        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
        Buffers: shared hit=7824
        ->  Bitmap Heap Scan on documentos d (actual time=6.108..52.515 rows=2000 loops=1)
              Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%facturas%'::text) OR (busqueda @@ '''factur'':*'::tsquery) OR (busqueda_contenido @@ '''factur'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (busqueda_contenido @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 40750
              Heap Blocks: exact=7738
              Buffers: shared hit=7824
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.360..3.361 rows=42750 loops=1)
                    Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.544..0.855 rows=2 loops=1)
                      One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.468..0.778 rows=2 loops=1)
                            Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%facturas%'::text))
                            Rows Removed by Filter: 16
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (actual time=0.660..0.660 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca_1 (actual time=0.648..0.648 rows=0 loops=1)
                            Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
Planning:
  Buffers: shared hit=1
Planning Time: 0.321 ms
Execution Time: 53.044 ms
```

</details>

<details>
<summary>Búsqueda por relevancia de la usuaria (página): Execution Time: 93.443 ms</summary>

```
Limit (actual time=93.074..93.089 rows=20 loops=1)
  Buffers: shared hit=7848
  InitPlan 3
    ->  Result (actual time=0.629..0.630 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=93.070..93.080 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'facturas textiles'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'facturas textiles%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%facturas%'::text) AND (d.busqueda_nombre ~~ '%textiles%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*'::tsquery))) THEN 5 WHEN (((d.busqueda_texto ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*'::tsquery) OR (d.busqueda_contenido @@ '''factur'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*'::tsquery) OR (d.busqueda_contenido @@ '''textil'':*'::tsquery))) THEN 6 ELSE 7 END), (ts_rank(d.busqueda, '''factur'':* | ''textil'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7848
        ->  Result (actual time=12.182..87.429 rows=2000 loops=1)
              One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
              Buffers: shared hit=7848
              ->  Hash Join (actual time=12.059..84.568 rows=2000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=7848
                    ->  Hash Join (actual time=12.012..83.594 rows=2000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=7847
                          ->  Bitmap Heap Scan on documentos d (actual time=10.693..81.154 rows=2000 loops=1)
                                Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%facturas%'::text) OR (busqueda @@ '''factur'':*'::tsquery) OR (busqueda_contenido @@ '''factur'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (busqueda_contenido @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 40750
                                Heap Blocks: exact=7738
                                Buffers: shared hit=7824
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=6.683..6.683 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.560..1.196 rows=2 loops=1)
                                        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.473..1.106 rows=2 loops=1)
                                              Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%facturas%'::text))
                                              Rows Removed by Filter: 16
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (actual time=1.033..1.033 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca_1 (actual time=1.012..1.012 rows=0 loops=1)
                                              Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                          ->  Hash (actual time=1.308..1.309 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.721..1.297 rows=9 loops=1)
                                      Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.035..0.036 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.026..0.029 rows=11 loops=1)
                                Filter: (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 1.485 ms
Execution Time: 93.443 ms
```

</details>

<details>
<summary>Segunda pasada por parecido de la usuaria (total): Execution Time: 228.359 ms</summary>

```
Aggregate (actual time=228.237..228.246 rows=1 loops=1)
  Buffers: shared hit=7824
  InitPlan 3
    ->  Result (actual time=0.529..0.530 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=8.060..227.929 rows=2000 loops=1)
        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
        Buffers: shared hit=7824
        ->  Bitmap Heap Scan on documentos d (actual time=7.994..227.504 rows=2000 loops=1)
              Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%factrua%'::text) OR (busqueda @@ '''factru'':*'::tsquery) OR (busqueda_contenido @@ '''factru'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1)) OR (extensions.word_similarity('factrua'::text, busqueda_nombre) >= '0.5'::double precision)) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (busqueda_contenido @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1)) OR (extensions.word_similarity('textiles'::text, busqueda_nombre) >= '0.5'::double precision)))
              Rows Removed by Filter: 40750
              Heap Blocks: exact=7738
              Buffers: shared hit=7824
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=4.530..4.531 rows=42750 loops=1)
                    Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=1.015..1.016 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.939..0.940 rows=0 loops=1)
                            Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%factrua%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (actual time=0.871..0.872 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca_1 (actual time=0.854..0.854 rows=0 loops=1)
                            Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
Planning:
  Buffers: shared hit=1
Planning Time: 0.414 ms
Execution Time: 228.359 ms
```

</details>

<details>
<summary>Segunda pasada por parecido de la usuaria (página): Execution Time: 276.370 ms</summary>

```
Limit (actual time=276.218..276.231 rows=20 loops=1)
  Buffers: shared hit=7848
  InitPlan 3
    ->  Result (actual time=0.377..0.378 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=276.214..276.223 rows=20 loops=1)
        Sort Key: ((extensions.word_similarity('factrua'::text, d.busqueda_nombre) + extensions.word_similarity('textiles'::text, d.busqueda_nombre))) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7848
        ->  Result (actual time=9.136..273.069 rows=2000 loops=1)
              One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
              Buffers: shared hit=7848
              ->  Hash Join (actual time=9.052..256.553 rows=2000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=7848
                    ->  Hash Join (actual time=9.022..255.816 rows=2000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=7847
                          ->  Bitmap Heap Scan on documentos d (actual time=8.103..253.793 rows=2000 loops=1)
                                Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%factrua%'::text) OR (busqueda @@ '''factru'':*'::tsquery) OR (busqueda_contenido @@ '''factru'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1)) OR (extensions.word_similarity('factrua'::text, busqueda_nombre) >= '0.5'::double precision)) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (busqueda_contenido @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1)) OR (extensions.word_similarity('textiles'::text, busqueda_nombre) >= '0.5'::double precision)))
                                Rows Removed by Filter: 40750
                                Heap Blocks: exact=7738
                                Buffers: shared hit=7824
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=4.388..4.389 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=1.086..1.087 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.994..0.994 rows=0 loops=1)
                                              Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%factrua%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (actual time=0.851..0.852 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca_1 (actual time=0.832..0.832 rows=0 loops=1)
                                              Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                          ->  Hash (actual time=0.909..0.910 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.396..0.903 rows=9 loops=1)
                                      Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.022..0.023 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.015..0.018 rows=11 loops=1)
                                Filter: (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.820 ms
Execution Time: 276.370 ms
```

</details>

<details>
<summary>Búsqueda dentro del archivo de la usuaria (total): Execution Time: 57.707 ms</summary>

```
Aggregate (actual time=57.620..57.628 rows=1 loops=1)
  Buffers: shared hit=7801
  InitPlan 3
    ->  Result (actual time=0.372..0.373 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=5.250..57.031 rows=9267 loops=1)
        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
        Buffers: shared hit=7801
        ->  Bitmap Heap Scan on documentos d (actual time=5.201..56.074 rows=9267 loops=1)
              Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%chompa%'::text) OR (busqueda @@ '''chomp'':*'::tsquery) OR (busqueda_contenido @@ '''chomp'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%alpaca%'::text) OR (busqueda @@ '''alpac'':*'::tsquery) OR (busqueda_contenido @@ '''alpac'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 33483
              Heap Blocks: exact=7738
              Buffers: shared hit=7801
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.403..3.404 rows=42750 loops=1)
                    Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.714..0.715 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.650..0.650 rows=0 loops=1)
                            Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%chompa%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (never executed)
                      One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                      ->  Seq Scan on categorias ca_1 (never executed)
                            Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%alpaca%'::text))
Planning:
  Buffers: shared hit=1
Planning Time: 0.306 ms
Execution Time: 57.707 ms
```

</details>

<details>
<summary>Búsqueda dentro del archivo de la usuaria (página): Execution Time: 76.553 ms</summary>

```
Limit (actual time=76.423..76.436 rows=20 loops=1)
  Buffers: shared hit=7825
  InitPlan 3
    ->  Result (actual time=0.270..0.271 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=76.419..76.428 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'chompa alpaca'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'chompa alpaca%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%chompa%'::text) AND (d.busqueda_nombre ~~ '%alpaca%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%chompa%'::text) OR (d.busqueda @@ '''chomp'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%alpaca%'::text) OR (d.busqueda @@ '''alpac'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%chompa%'::text) OR (d.busqueda @@ '''chomp'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%alpaca%'::text) OR (d.busqueda @@ '''alpac'':*'::tsquery))) THEN 5 WHEN (((d.busqueda_texto ~~ '%chompa%'::text) OR (d.busqueda @@ '''chomp'':*'::tsquery) OR (d.busqueda_contenido @@ '''chomp'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%alpaca%'::text) OR (d.busqueda @@ '''alpac'':*'::tsquery) OR (d.busqueda_contenido @@ '''alpac'':*'::tsquery))) THEN 6 ELSE 7 END), (ts_rank(d.busqueda, '''chomp'':* | ''alpac'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7825
        ->  Result (actual time=5.392..62.384 rows=9267 loops=1)
              One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
              Buffers: shared hit=7825
              ->  Hash Join (actual time=5.325..52.079 rows=9267 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=7825
                    ->  Hash Join (actual time=5.303..50.469 rows=9267 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=7824
                          ->  Bitmap Heap Scan on documentos d (actual time=4.560..48.115 rows=9267 loops=1)
                                Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%chompa%'::text) OR (busqueda @@ '''chomp'':*'::tsquery) OR (busqueda_contenido @@ '''chomp'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%alpaca%'::text) OR (busqueda @@ '''alpac'':*'::tsquery) OR (busqueda_contenido @@ '''alpac'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 33483
                                Heap Blocks: exact=7738
                                Buffers: shared hit=7801
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.969..2.970 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.713..0.714 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.655..0.656 rows=0 loops=1)
                                              Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%chompa%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (never executed)
                                        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                        ->  Seq Scan on categorias ca_1 (never executed)
                                              Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%alpaca%'::text))
                          ->  Hash (actual time=0.735..0.736 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.365..0.730 rows=9 loops=1)
                                      Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.016..0.016 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.010..0.012 rows=11 loops=1)
                                Filter: (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.692 ms
Execution Time: 76.553 ms
```

</details>

<details>
<summary>Filtro por estado de la usuaria (total): Execution Time: 29.431 ms</summary>

```
Aggregate (actual time=29.354..29.361 rows=1 loops=1)
  Buffers: shared hit=7863
  InitPlan 1
    ->  Result (actual time=0.286..0.286 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=7.172..29.285 rows=1250 loops=1)
        One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
        Buffers: shared hit=7863
        ->  Hash Left Join (actual time=7.080..29.091 rows=1250 loops=1)
              Hash Cond: (d.id = ultima.documento_id)
              Filter: ((COALESCE(ultima.estado, 'sin_solicitud'::character varying))::text = 'pendiente'::text)
              Rows Removed by Filter: 41500
              Buffers: shared hit=7863
              ->  Bitmap Heap Scan on documentos d (actual time=3.647..19.238 rows=42750 loops=1)
                    Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
                    Heap Blocks: exact=7738
                    Buffers: shared hit=7778
                    ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.733..2.734 rows=42750 loops=1)
                          Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                          Buffers: shared hit=40
              ->  Hash (actual time=3.397..3.400 rows=4500 loops=1)
                    Buckets: 8192  Batches: 1  Memory Usage: 318kB
                    Buffers: shared hit=85
                    ->  Subquery Scan on ultima (actual time=1.760..2.908 rows=4500 loops=1)
                          Buffers: shared hit=85
                          ->  Unique (actual time=1.758..2.558 rows=4500 loops=1)
                                Buffers: shared hit=85
                                ->  Sort (actual time=1.757..2.019 rows=4500 loops=1)
                                      Sort Key: s.documento_id, s.creada_en DESC
                                      Sort Method: quicksort  Memory: 439kB
                                      Buffers: shared hit=85
                                      ->  Result (actual time=0.075..1.023 rows=4500 loops=1)
                                            One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                            Buffers: shared hit=85
                                            ->  Seq Scan on solicitudes s (actual time=0.013..0.630 rows=4500 loops=1)
                                                  Filter: (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                                  Buffers: shared hit=85
Planning:
  Buffers: shared hit=1
Planning Time: 0.210 ms
Execution Time: 29.431 ms
```

</details>

<details>
<summary>Filtro por estado de la usuaria (página): Execution Time: 37.754 ms</summary>

```
Limit (actual time=37.631..37.645 rows=20 loops=1)
  Buffers: shared hit=7884
  InitPlan 1
    ->  Result (actual time=0.361..0.362 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=37.628..37.637 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7884
        ->  Result (actual time=9.428..37.147 rows=1250 loops=1)
              One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
              Buffers: shared hit=7884
              ->  Nested Loop (actual time=9.367..36.921 rows=1250 loops=1)
                    Join Filter: (u.id = d.subido_por)
                    Rows Removed by Join Filter: 6250
                    Buffers: shared hit=7884
                    ->  Nested Loop (actual time=9.357..35.822 rows=1250 loops=1)
                          Join Filter: (c.id = d.categoria_id)
                          Rows Removed by Join Filter: 6250
                          Buffers: shared hit=7883
                          ->  Hash Left Join (actual time=8.693..33.948 rows=1250 loops=1)
                                Hash Cond: (d.id = ultima.documento_id)
                                Filter: ((COALESCE(ultima.estado, 'sin_solicitud'::character varying))::text = 'pendiente'::text)
                                Rows Removed by Filter: 41500
                                Buffers: shared hit=7863
                                ->  Bitmap Heap Scan on documentos d (actual time=4.253..21.577 rows=42750 loops=1)
                                      Recheck Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
                                      Heap Blocks: exact=7738
                                      Buffers: shared hit=7778
                                      ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.258..3.259 rows=42750 loops=1)
                                            Index Cond: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                                            Buffers: shared hit=40
                                ->  Hash (actual time=4.400..4.404 rows=4500 loops=1)
                                      Buckets: 8192  Batches: 1  Memory Usage: 318kB
                                      Buffers: shared hit=85
                                      ->  Subquery Scan on ultima (actual time=2.281..3.786 rows=4500 loops=1)
                                            Buffers: shared hit=85
                                            ->  Unique (actual time=2.279..3.322 rows=4500 loops=1)
                                                  Buffers: shared hit=85
                                                  ->  Sort (actual time=2.277..2.604 rows=4500 loops=1)
                                                        Sort Key: s.documento_id, s.creada_en DESC
                                                        Sort Method: quicksort  Memory: 439kB
                                                        Buffers: shared hit=85
                                                        ->  Result (actual time=0.087..1.291 rows=4500 loops=1)
                                                              One-Time Filter: (empresa_actual() = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                                              Buffers: shared hit=85
                                                              ->  Seq Scan on solicitudes s (actual time=0.015..0.831 rows=4500 loops=1)
                                                                    Filter: (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                                                    Buffers: shared hit=85
                          ->  Materialize (actual time=0.000..0.001 rows=6 loops=1250)
                                Buffers: shared hit=20
                                ->  Seq Scan on categorias c (actual time=0.403..0.653 rows=9 loops=1)
                                      Filter: ((empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid) AND puede_ver_categoria(id))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.000..0.000 rows=6 loops=1250)
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.006..0.007 rows=9 loops=1)
                                Filter: (empresa_id = 'ea16b586-53f8-44e4-a614-c424858f132b'::uuid)
                                Rows Removed by Filter: 1
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.627 ms
Execution Time: 37.754 ms
```

</details>
