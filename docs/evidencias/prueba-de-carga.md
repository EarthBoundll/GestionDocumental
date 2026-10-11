# Prueba de carga: 50.000 documentos

Generado por `npm run informe:carga` (backend) el 11 de octubre de 2026, 8:54 a. m., hora de Lima.

**Pregunta.** ¿El listado y la búsqueda siguen por debajo de 1 s (RNF05, indicador 7) cuando una empresa
tiene 50,000 documentos, con categorías restringidas y otra empresa en las mismas tablas?

**Resultado: 26 de 26 escenarios con el percentil 95 dentro de su umbral:** 1 s para listar
y buscar (RNF05) y 5 s para las exportaciones (la hoja para imprimir, el CSV y el Excel), que descargan de una vez todo lo filtrado.

## Los datos

- Empresa medida: 50,000 documentos de un taller textil (facturas, guías, órdenes de compra,
  planillas…) repartidos en 8 categorías, dos de ellas restringidas, con fechas de tres años y medio, su
  versión 1, uno de cada 7 como foto, uno de cada 10 con su solicitud de aprobación y uno de cada 50 en la papelera; 200,000 asientos de historial; 11 personas.
- El texto de cada archivo que no es una foto (D45): unos 1.700 caracteres con el cliente, su RUC, dos prendas y
  cláusulas de entrega, pago y garantía, como lo dejaría la lectura al subirlo.
- Otra empresa con 10,000 documentos en las mismas tablas.
- Quien mide: la **usuaria** ve una de las dos categorías restringidas, así que la RLS evalúa las dos
  ramas (D22); la **administradora** las ve todas. Carga de los datos: 28 s.

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
| Listado inicial: los 20 más recientes | usuaria | 42,750 | 14 ms | 16 ms | 17 ms | 1 s | Sí |
| Listado inicial: los 20 más recientes | administradora | 49,000 | 13 ms | 16 ms | 17 ms | 1 s | Sí |
| Búsqueda por nombre, sin tildes («guia de remision») | usuaria | 6,000 | 131 ms | 153 ms | 182 ms | 1 s | Sí |
| Búsqueda de un documento concreto («N° 031416») | usuaria | 1 | 112 ms | 120 ms | 191 ms | 1 s | Sí |
| El mismo, de una categoría restringida sin acceso («N° 031415») | usuaria | 0 | 111 ms | 136 ms | 138 ms | 1 s | Sí |
| Filtro por categoría (Facturas) | usuaria | 6,000 | 9 ms | 14 ms | 18 ms | 1 s | Sí |
| Filtro por categoría restringida con acceso (Planillas) | usuaria | 6,000 | 10 ms | 12 ms | 14 ms | 1 s | Sí |
| Filtro por fechas (un trimestre) | usuaria | 2,808 | 15 ms | 18 ms | 20 ms | 1 s | Sí |
| Nombre, categoría y fechas a la vez | usuaria | 534 | 39 ms | 44 ms | 45 ms | 1 s | Sí |
| Ordenado por nombre | usuaria | 42,750 | 68 ms | 79 ms | 83 ms | 1 s | Sí |
| Por palabras y su raíz, por relevancia («facturas textiles») | usuaria | 2,000 | 120 ms | 146 ms | 155 ms | 1 s | Sí |
| Solo en la descripción («medicion carga») | usuaria | 14,250 | 163 ms | 185 ms | 209 ms | 1 s | Sí |
| Con errores de escritura: segunda pasada por parecido («factrua textiles») | usuaria | 2,000 | 535 ms | 570 ms | 603 ms | 1 s | Sí |
| Dentro del archivo, muchas coincidencias («chompa alpaca») | usuaria | 9,267 | 156 ms | 170 ms | 173 ms | 1 s | Sí |
| Dentro del archivo, un RUC que está en uno solo («20248791223») | usuaria | 1 | 110 ms | 130 ms | 146 ms | 1 s | Sí |
| Sugerencias mientras se escribe («guia rem») | usuaria | 5 | 63 ms | 75 ms | 75 ms | 1 s | Sí |
| Sugerencias de un documento concreto («031416») | usuaria | 1 | 58 ms | 69 ms | 75 ms | 1 s | Sí |
| Filtro por estado de aprobación (pendientes) | usuaria | 1,250 | 66 ms | 74 ms | 76 ms | 1 s | Sí |
| Filtro por tipo (fotos) | usuaria | 6,107 | 44 ms | 53 ms | 55 ms | 1 s | Sí |
| Texto, tipo, estado y fecha de subida a la vez | usuaria | 0 | 370 ms | 404 ms | 405 ms | 1 s | Sí |
| Página 500 del listado | usuaria | 42,750 | 79 ms | 98 ms | 102 ms | 1 s | Sí |
| Historial: primera página | administradora | 200,501 | 27 ms | 34 ms | 35 ms | 1 s | Sí |
| Historial filtrado por una semana | administradora | 2,016 | 10 ms | 12 ms | 12 ms | 1 s | Sí |
| Historial imprimible: seis días enteros | administradora | 1,728 | 39 ms | 48 ms | 48 ms | 5 s | Sí |
| Listado documental completo en CSV | administradora | 49,000 | 431 ms | 463 ms | 463 ms | 5 s | Sí |
| Listado documental completo en Excel | administradora | — | 1299 ms | 1399 ms | 1399 ms | 5 s | Sí |

## Lo que encontró

La primera ejecución, el 7 de octubre de 2026, se hizo con la política de visibilidad de la migración 004, que
llamaba a `puede_ver_categoria()` en cada fila. Una función `SECURITY DEFINER` no se integra en la consulta,
y cada página la evaluaba dos veces por documento (para el total y para la página):

| Escenario | Con la política de la 004 (mediana) | Con la de la 010 (mediana) |
|---|---:|---:|
| Listado inicial de la usuaria | 1948 ms | 14 ms |
| Listado inicial de la administradora | 925 ms | 13 ms |
| Búsqueda por nombre de la usuaria | 3846 ms (`guia remision`) | 131 ms |

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
| Búsqueda por nombre, sin tildes («guia de remision») | 282 ms | 131 ms |
| Búsqueda de un documento concreto («N° 031416») | 285 ms | 112 ms |
| Ordenado por nombre | 159 ms | 68 ms |
| Listado documental completo en CSV | 791 ms | 431 ms |

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
| Búsqueda por nombre, sin tildes («guia de remision») | 100 ms | 293 ms | 131 ms |
| Búsqueda de un documento concreto («N° 031416») | 79 ms | 276 ms | 112 ms |
| Por palabras y su raíz, por relevancia («facturas textiles») | 91 ms | 323 ms | 120 ms |
| Solo en la descripción («medicion carga») | 135 ms | 344 ms | 163 ms |
| Con errores de escritura: segunda pasada por parecido («factrua textiles») | 533 ms | 905 ms (máximo 1018 ms) | 535 ms |
| Dentro del archivo, muchas coincidencias («chompa alpaca») | — | 438 ms | 156 ms |
| Dentro del archivo, un RUC que está en uno solo | — | 288 ms | 110 ms |
| Sugerencias mientras se escribe («guia rem») | 50 ms | 154 ms | 63 ms |

«Sin el texto» es la ejecución anterior de este informe, con los mismos documentos sin su contenido. Lo que cuesta
todavía el contenido es leer su columna en los documentos donde lo demás no coincidió; dentro de él, las coincidencias
empatan y va primero lo más reciente, así que no hay que leerlo de nuevo para ordenar.

## Planes de ejecución

Las mismas consultas que ejecuta la API, con el rol `app_empresa` y la identidad de la usuaria: es decir,
con la RLS aplicada.

<details>
<summary>Listado inicial de la usuaria (total): Execution Time: 9.529 ms</summary>

```
Aggregate (actual time=9.493..9.495 rows=1 loops=1)
  Buffers: shared hit=41
  InitPlan 1
    ->  Result (actual time=0.330..0.330 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=0.412..7.426 rows=42750 loops=1)
        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
        Buffers: shared hit=41
        ->  Index Only Scan using documentos_por_categoria on documentos d (actual time=0.352..3.736 rows=42750 loops=1)
              Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
              Heap Fetches: 0
              Buffers: shared hit=41
Planning:
  Buffers: shared hit=1
Planning Time: 0.208 ms
Execution Time: 9.529 ms
```

</details>

<details>
<summary>Listado inicial de la usuaria (página): Execution Time: 0.980 ms</summary>

```
Limit (actual time=0.927..0.932 rows=20 loops=1)
  Buffers: shared hit=53
  InitPlan 1
    ->  Result (actual time=0.310..0.310 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Incremental Sort (actual time=0.925..0.927 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Presorted Key: d.creado_en
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 30kB  Peak Memory: 30kB
        Buffers: shared hit=53
        ->  Result (actual time=0.832..0.908 rows=21 loops=1)
              One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
              Buffers: shared hit=53
              ->  Nested Loop (actual time=0.783..0.858 rows=21 loops=1)
                    Join Filter: (c.id = d.categoria_id)
                    Rows Removed by Join Filter: 105
                    Buffers: shared hit=53
                    ->  Nested Loop (actual time=0.341..0.398 rows=21 loops=1)
                          Buffers: shared hit=33
                          ->  Index Scan using documentos_recientes on documentos d (actual time=0.331..0.361 rows=21 loops=1)
                                Index Cond: (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                Filter: (categoria_id = ANY ((InitPlan 1).col1))
                                Rows Removed by Filter: 3
                                Buffers: shared hit=13
                          ->  Memoize (actual time=0.001..0.001 rows=1 loops=21)
                                Cache Key: d.subido_por
                                Cache Mode: logical
                                Hits: 11  Misses: 10  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                Buffers: shared hit=20
                                ->  Index Scan using usuarios_id_empresa on usuarios u (actual time=0.001..0.001 rows=1 loops=10)
                                      Index Cond: ((id = d.subido_por) AND (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.008..0.021 rows=6 loops=21)
                          Buffers: shared hit=20
                          ->  Seq Scan on categorias c (actual time=0.170..0.436 rows=9 loops=1)
                                Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id))
                                Buffers: shared hit=20
Planning:
  Buffers: shared hit=9
Planning Time: 0.466 ms
Execution Time: 0.980 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (total): Execution Time: 48.529 ms</summary>

```
Aggregate (actual time=48.452..48.458 rows=1 loops=1)
  Buffers: shared hit=7801
  InitPlan 3
    ->  Result (actual time=0.405..0.406 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=5.557..48.098 rows=6000 loops=1)
        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
        Buffers: shared hit=7801
        ->  Bitmap Heap Scan on documentos d (actual time=5.513..47.445 rows=6000 loops=1)
              Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%guia%'::text) OR (busqueda @@ '''gui'':*'::tsquery) OR (busqueda_contenido @@ '''gui'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%remision%'::text) OR (busqueda @@ '''remision'':*'::tsquery) OR (busqueda_contenido @@ '''remision'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 36750
              Heap Blocks: exact=7738
              Buffers: shared hit=7801
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.475..3.475 rows=42750 loops=1)
                    Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.675..0.912 rows=1 loops=1)
                      One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.615..0.852 rows=1 loops=1)
                            Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%guia%'::text))
                            Rows Removed by Filter: 17
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (never executed)
                      One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                      ->  Seq Scan on categorias ca_1 (never executed)
                            Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%remision%'::text))
Planning:
  Buffers: shared hit=1
Planning Time: 0.247 ms
Execution Time: 48.529 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (página): Execution Time: 65.171 ms</summary>

```
Limit (actual time=65.061..65.075 rows=20 loops=1)
  Buffers: shared hit=7825
  InitPlan 3
    ->  Result (actual time=0.253..0.254 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=65.059..65.068 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'guia de remision'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'guia de remision%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%guia%'::text) AND (d.busqueda_nombre ~~ '%remision%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*'::tsquery))) THEN 5 WHEN (((d.busqueda_texto ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*'::tsquery) OR (d.busqueda_contenido @@ '''gui'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*'::tsquery) OR (d.busqueda_contenido @@ '''remision'':*'::tsquery))) THEN 6 ELSE 7 END), (ts_rank(d.busqueda, '''gui'':* | ''remision'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7825
        ->  Result (actual time=5.895..53.539 rows=6000 loops=1)
              One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
              Buffers: shared hit=7825
              ->  Hash Join (actual time=5.838..51.218 rows=6000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=7825
                    ->  Hash Join (actual time=5.819..49.979 rows=6000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=7824
                          ->  Bitmap Heap Scan on documentos d (actual time=5.246..48.059 rows=6000 loops=1)
                                Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%guia%'::text) OR (busqueda @@ '''gui'':*'::tsquery) OR (busqueda_contenido @@ '''gui'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%remision%'::text) OR (busqueda @@ '''remision'':*'::tsquery) OR (busqueda_contenido @@ '''remision'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 36750
                                Heap Blocks: exact=7738
                                Buffers: shared hit=7801
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.242..3.243 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.657..0.898 rows=1 loops=1)
                                        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.581..0.821 rows=1 loops=1)
                                              Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%guia%'::text))
                                              Rows Removed by Filter: 17
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (never executed)
                                        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                        ->  Seq Scan on categorias ca_1 (never executed)
                                              Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%remision%'::text))
                          ->  Hash (actual time=0.566..0.567 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.249..0.564 rows=9 loops=1)
                                      Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.013..0.015 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.008..0.011 rows=11 loops=1)
                                Filter: (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.645 ms
Execution Time: 65.171 ms
```

</details>

<details>
<summary>Búsqueda por relevancia de la usuaria (total): Execution Time: 50.750 ms</summary>

```
Aggregate (actual time=50.649..50.656 rows=1 loops=1)
  Buffers: shared hit=7824
  InitPlan 3
    ->  Result (actual time=0.502..0.503 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=6.053..50.496 rows=2000 loops=1)
        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
        Buffers: shared hit=7824
        ->  Bitmap Heap Scan on documentos d (actual time=5.985..50.208 rows=2000 loops=1)
              Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%facturas%'::text) OR (busqueda @@ '''factur'':*'::tsquery) OR (busqueda_contenido @@ '''factur'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (busqueda_contenido @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 40750
              Heap Blocks: exact=7738
              Buffers: shared hit=7824
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.587..3.587 rows=42750 loops=1)
                    Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.393..0.788 rows=2 loops=1)
                      One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.331..0.725 rows=2 loops=1)
                            Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%facturas%'::text))
                            Rows Removed by Filter: 16
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (actual time=0.495..0.496 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca_1 (actual time=0.484..0.484 rows=0 loops=1)
                            Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
Planning:
  Buffers: shared hit=1
Planning Time: 0.360 ms
Execution Time: 50.750 ms
```

</details>

<details>
<summary>Búsqueda por relevancia de la usuaria (página): Execution Time: 56.928 ms</summary>

```
Limit (actual time=56.726..56.739 rows=20 loops=1)
  Buffers: shared hit=7848
  InitPlan 3
    ->  Result (actual time=0.267..0.267 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=56.722..56.731 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'facturas textiles'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'facturas textiles%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%facturas%'::text) AND (d.busqueda_nombre ~~ '%textiles%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*'::tsquery))) THEN 5 WHEN (((d.busqueda_texto ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*'::tsquery) OR (d.busqueda_contenido @@ '''factur'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*'::tsquery) OR (d.busqueda_contenido @@ '''textil'':*'::tsquery))) THEN 6 ELSE 7 END), (ts_rank(d.busqueda, '''factur'':* | ''textil'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7848
        ->  Result (actual time=6.270..52.885 rows=2000 loops=1)
              One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
              Buffers: shared hit=7848
              ->  Hash Join (actual time=6.199..51.338 rows=2000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=7848
                    ->  Hash Join (actual time=6.176..50.876 rows=2000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=7847
                          ->  Bitmap Heap Scan on documentos d (actual time=5.618..49.770 rows=2000 loops=1)
                                Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%facturas%'::text) OR (busqueda @@ '''factur'':*'::tsquery) OR (busqueda_contenido @@ '''factur'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (busqueda_contenido @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 40750
                                Heap Blocks: exact=7738
                                Buffers: shared hit=7824
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.256..3.256 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.381..0.736 rows=2 loops=1)
                                        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.316..0.670 rows=2 loops=1)
                                              Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%facturas%'::text))
                                              Rows Removed by Filter: 16
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (actual time=0.522..0.523 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca_1 (actual time=0.511..0.511 rows=0 loops=1)
                                              Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                          ->  Hash (actual time=0.551..0.553 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.269..0.548 rows=9 loops=1)
                                      Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.017..0.018 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.012..0.014 rows=11 loops=1)
                                Filter: (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.610 ms
Execution Time: 56.928 ms
```

</details>

<details>
<summary>Segunda pasada por parecido de la usuaria (total): Execution Time: 207.127 ms</summary>

```
Aggregate (actual time=207.049..207.056 rows=1 loops=1)
  Buffers: shared hit=7824
  InitPlan 3
    ->  Result (actual time=0.287..0.288 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=5.800..206.827 rows=2000 loops=1)
        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
        Buffers: shared hit=7824
        ->  Bitmap Heap Scan on documentos d (actual time=5.757..206.482 rows=2000 loops=1)
              Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%factrua%'::text) OR (busqueda @@ '''factru'':*'::tsquery) OR (busqueda_contenido @@ '''factru'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1)) OR (extensions.word_similarity('factrua'::text, busqueda_nombre) >= '0.5'::double precision)) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (busqueda_contenido @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1)) OR (extensions.word_similarity('textiles'::text, busqueda_nombre) >= '0.5'::double precision)))
              Rows Removed by Filter: 40750
              Heap Blocks: exact=7738
              Buffers: shared hit=7824
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.290..3.290 rows=42750 loops=1)
                    Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.696..0.697 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.633..0.633 rows=0 loops=1)
                            Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%factrua%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (actual time=0.515..0.516 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca_1 (actual time=0.503..0.503 rows=0 loops=1)
                            Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
Planning:
  Buffers: shared hit=1
Planning Time: 0.285 ms
Execution Time: 207.127 ms
```

</details>

<details>
<summary>Segunda pasada por parecido de la usuaria (página): Execution Time: 225.322 ms</summary>

```
Limit (actual time=225.206..225.220 rows=20 loops=1)
  Buffers: shared hit=7848
  InitPlan 3
    ->  Result (actual time=0.255..0.256 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=225.202..225.212 rows=20 loops=1)
        Sort Key: ((extensions.word_similarity('factrua'::text, d.busqueda_nombre) + extensions.word_similarity('textiles'::text, d.busqueda_nombre))) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7848
        ->  Result (actual time=6.708..222.566 rows=2000 loops=1)
              One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
              Buffers: shared hit=7848
              ->  Hash Join (actual time=6.648..208.821 rows=2000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=7848
                    ->  Hash Join (actual time=6.630..208.194 rows=2000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=7847
                          ->  Bitmap Heap Scan on documentos d (actual time=5.912..206.708 rows=2000 loops=1)
                                Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%factrua%'::text) OR (busqueda @@ '''factru'':*'::tsquery) OR (busqueda_contenido @@ '''factru'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1)) OR (extensions.word_similarity('factrua'::text, busqueda_nombre) >= '0.5'::double precision)) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (busqueda_contenido @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1)) OR (extensions.word_similarity('textiles'::text, busqueda_nombre) >= '0.5'::double precision)))
                                Rows Removed by Filter: 40750
                                Heap Blocks: exact=7738
                                Buffers: shared hit=7824
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.204..3.205 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.737..0.738 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.674..0.675 rows=0 loops=1)
                                              Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%factrua%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (actual time=0.550..0.551 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca_1 (actual time=0.537..0.538 rows=0 loops=1)
                                              Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                          ->  Hash (actual time=0.710..0.712 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.352..0.706 rows=9 loops=1)
                                      Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.013..0.014 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.008..0.010 rows=11 loops=1)
                                Filter: (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.573 ms
Execution Time: 225.322 ms
```

</details>

<details>
<summary>Búsqueda dentro del archivo de la usuaria (total): Execution Time: 53.052 ms</summary>

```
Aggregate (actual time=52.977..52.983 rows=1 loops=1)
  Buffers: shared hit=7801
  InitPlan 3
    ->  Result (actual time=0.282..0.283 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=5.356..52.449 rows=9267 loops=1)
        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
        Buffers: shared hit=7801
        ->  Bitmap Heap Scan on documentos d (actual time=5.305..51.524 rows=9267 loops=1)
              Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%chompa%'::text) OR (busqueda @@ '''chomp'':*'::tsquery) OR (busqueda_contenido @@ '''chomp'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%alpaca%'::text) OR (busqueda @@ '''alpac'':*'::tsquery) OR (busqueda_contenido @@ '''alpac'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 33483
              Heap Blocks: exact=7738
              Buffers: shared hit=7801
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.427..3.427 rows=42750 loops=1)
                    Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=40
              SubPlan 1
                ->  Result (actual time=0.723..0.724 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.657..0.658 rows=0 loops=1)
                            Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%chompa%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (never executed)
                      One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                      ->  Seq Scan on categorias ca_1 (never executed)
                            Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%alpaca%'::text))
Planning:
  Buffers: shared hit=1
Planning Time: 0.309 ms
Execution Time: 53.052 ms
```

</details>

<details>
<summary>Búsqueda dentro del archivo de la usuaria (página): Execution Time: 86.742 ms</summary>

```
Limit (actual time=86.604..86.617 rows=20 loops=1)
  Buffers: shared hit=7825
  InitPlan 3
    ->  Result (actual time=0.248..0.249 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=86.600..86.609 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'chompa alpaca'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'chompa alpaca%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%chompa%'::text) AND (d.busqueda_nombre ~~ '%alpaca%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%chompa%'::text) OR (d.busqueda @@ '''chomp'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%alpaca%'::text) OR (d.busqueda @@ '''alpac'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%chompa%'::text) OR (d.busqueda @@ '''chomp'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%alpaca%'::text) OR (d.busqueda @@ '''alpac'':*'::tsquery))) THEN 5 WHEN (((d.busqueda_texto ~~ '%chompa%'::text) OR (d.busqueda @@ '''chomp'':*'::tsquery) OR (d.busqueda_contenido @@ '''chomp'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%alpaca%'::text) OR (d.busqueda @@ '''alpac'':*'::tsquery) OR (d.busqueda_contenido @@ '''alpac'':*'::tsquery))) THEN 6 ELSE 7 END), (ts_rank(d.busqueda, '''chomp'':* | ''alpac'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7825
        ->  Result (actual time=5.846..69.322 rows=9267 loops=1)
              One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
              Buffers: shared hit=7825
              ->  Hash Join (actual time=5.788..56.653 rows=9267 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=7825
                    ->  Hash Join (actual time=5.770..54.795 rows=9267 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=7824
                          ->  Bitmap Heap Scan on documentos d (actual time=5.239..52.264 rows=9267 loops=1)
                                Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%chompa%'::text) OR (busqueda @@ '''chomp'':*'::tsquery) OR (busqueda_contenido @@ '''chomp'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%alpaca%'::text) OR (busqueda @@ '''alpac'':*'::tsquery) OR (busqueda_contenido @@ '''alpac'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 33483
                                Heap Blocks: exact=7738
                                Buffers: shared hit=7801
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.360..3.360 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=40
                                SubPlan 1
                                  ->  Result (actual time=0.797..0.798 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.721..0.721 rows=0 loops=1)
                                              Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%chompa%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (never executed)
                                        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                        ->  Seq Scan on categorias ca_1 (never executed)
                                              Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%alpaca%'::text))
                          ->  Hash (actual time=0.524..0.525 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.247..0.521 rows=9 loops=1)
                                      Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.014..0.014 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.009..0.011 rows=11 loops=1)
                                Filter: (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.615 ms
Execution Time: 86.742 ms
```

</details>

<details>
<summary>Filtro por estado de la usuaria (total): Execution Time: 32.890 ms</summary>

```
Aggregate (actual time=32.805..32.813 rows=1 loops=1)
  Buffers: shared hit=7863
  InitPlan 1
    ->  Result (actual time=0.393..0.394 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=8.941..32.722 rows=1250 loops=1)
        One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
        Buffers: shared hit=7863
        ->  Hash Left Join (actual time=8.885..32.534 rows=1250 loops=1)
              Hash Cond: (d.id = ultima.documento_id)
              Filter: ((COALESCE(ultima.estado, 'sin_solicitud'::character varying))::text = 'pendiente'::text)
              Rows Removed by Filter: 41500
              Buffers: shared hit=7863
              ->  Bitmap Heap Scan on documentos d (actual time=4.529..20.757 rows=42750 loops=1)
                    Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
                    Heap Blocks: exact=7738
                    Buffers: shared hit=7778
                    ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.461..3.462 rows=42750 loops=1)
                          Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                          Buffers: shared hit=40
              ->  Hash (actual time=4.317..4.320 rows=4500 loops=1)
                    Buckets: 8192  Batches: 1  Memory Usage: 318kB
                    Buffers: shared hit=85
                    ->  Subquery Scan on ultima (actual time=2.313..3.740 rows=4500 loops=1)
                          Buffers: shared hit=85
                          ->  Unique (actual time=2.310..3.304 rows=4500 loops=1)
                                Buffers: shared hit=85
                                ->  Sort (actual time=2.308..2.640 rows=4500 loops=1)
                                      Sort Key: s.documento_id, s.creada_en DESC
                                      Sort Method: quicksort  Memory: 439kB
                                      Buffers: shared hit=85
                                      ->  Result (actual time=0.100..1.327 rows=4500 loops=1)
                                            One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                            Buffers: shared hit=85
                                            ->  Seq Scan on solicitudes s (actual time=0.018..0.811 rows=4500 loops=1)
                                                  Filter: (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                                  Buffers: shared hit=85
Planning:
  Buffers: shared hit=1
Planning Time: 0.266 ms
Execution Time: 32.890 ms
```

</details>

<details>
<summary>Filtro por estado de la usuaria (página): Execution Time: 36.644 ms</summary>

```
Limit (actual time=36.530..36.545 rows=20 loops=1)
  Buffers: shared hit=7884
  InitPlan 1
    ->  Result (actual time=0.327..0.328 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=36.527..36.537 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=7884
        ->  Result (actual time=9.554..36.012 rows=1250 loops=1)
              One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
              Buffers: shared hit=7884
              ->  Nested Loop (actual time=9.501..35.724 rows=1250 loops=1)
                    Join Filter: (u.id = d.subido_por)
                    Rows Removed by Join Filter: 6250
                    Buffers: shared hit=7884
                    ->  Nested Loop (actual time=9.489..34.560 rows=1250 loops=1)
                          Join Filter: (c.id = d.categoria_id)
                          Rows Removed by Join Filter: 6250
                          Buffers: shared hit=7883
                          ->  Hash Left Join (actual time=8.814..32.710 rows=1250 loops=1)
                                Hash Cond: (d.id = ultima.documento_id)
                                Filter: ((COALESCE(ultima.estado, 'sin_solicitud'::character varying))::text = 'pendiente'::text)
                                Rows Removed by Filter: 41500
                                Buffers: shared hit=7863
                                ->  Bitmap Heap Scan on documentos d (actual time=4.663..20.584 rows=42750 loops=1)
                                      Recheck Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
                                      Heap Blocks: exact=7738
                                      Buffers: shared hit=7778
                                      ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.494..3.494 rows=42750 loops=1)
                                            Index Cond: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                                            Buffers: shared hit=40
                                ->  Hash (actual time=4.094..4.098 rows=4500 loops=1)
                                      Buckets: 8192  Batches: 1  Memory Usage: 318kB
                                      Buffers: shared hit=85
                                      ->  Subquery Scan on ultima (actual time=2.152..3.536 rows=4500 loops=1)
                                            Buffers: shared hit=85
                                            ->  Unique (actual time=2.149..3.084 rows=4500 loops=1)
                                                  Buffers: shared hit=85
                                                  ->  Sort (actual time=2.148..2.467 rows=4500 loops=1)
                                                        Sort Key: s.documento_id, s.creada_en DESC
                                                        Sort Method: quicksort  Memory: 439kB
                                                        Buffers: shared hit=85
                                                        ->  Result (actual time=0.091..1.229 rows=4500 loops=1)
                                                              One-Time Filter: (empresa_actual() = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                                              Buffers: shared hit=85
                                                              ->  Seq Scan on solicitudes s (actual time=0.013..0.760 rows=4500 loops=1)
                                                                    Filter: (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                                                    Buffers: shared hit=85
                          ->  Materialize (actual time=0.000..0.001 rows=6 loops=1250)
                                Buffers: shared hit=20
                                ->  Seq Scan on categorias c (actual time=0.429..0.663 rows=9 loops=1)
                                      Filter: ((empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid) AND puede_ver_categoria(id))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.000..0.000 rows=6 loops=1250)
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.006..0.008 rows=9 loops=1)
                                Filter: (empresa_id = '932da999-6cf9-40d6-9b3c-7840ed59e591'::uuid)
                                Rows Removed by Filter: 1
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=9
Planning Time: 0.597 ms
Execution Time: 36.644 ms
```

</details>
