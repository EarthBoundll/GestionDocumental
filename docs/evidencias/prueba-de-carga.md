# Prueba de carga: 50.000 documentos

Generado por `npm run informe:carga` (backend) el 11 de octubre de 2026, 2:35 a. m., hora de Lima.

**Pregunta.** ¿El listado y la búsqueda siguen por debajo de 1 s (RNF05, indicador 7) cuando una empresa
tiene 50,000 documentos, con categorías restringidas y otra empresa en las mismas tablas?

**Resultado: 24 de 24 escenarios con el percentil 95 dentro de su umbral:** 1 s para listar
y buscar (RNF05) y 5 s para las exportaciones (la hoja para imprimir, el CSV y el Excel), que descargan de una vez todo lo filtrado.

## Los datos

- Empresa medida: 50,000 documentos de un taller textil (facturas, guías, órdenes de compra,
  planillas…) repartidos en 8 categorías, dos de ellas restringidas, con fechas de tres años y medio, su
  versión 1, uno de cada 7 como foto, uno de cada 10 con su solicitud de aprobación y uno de cada 50 en la papelera; 200,000 asientos de historial; 11 personas.
- Otra empresa con 10,000 documentos en las mismas tablas.
- Quien mide: la **usuaria** ve una de las dos categorías restringidas, así que la RLS evalúa las dos
  ramas (D22); la **administradora** las ve todas. Carga de los datos: 19 s.

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
| Listado inicial: los 20 más recientes | usuaria | 42,750 | 17 ms | 25 ms | 36 ms | 1 s | Sí |
| Listado inicial: los 20 más recientes | administradora | 49,000 | 17 ms | 22 ms | 27 ms | 1 s | Sí |
| Búsqueda por nombre, sin tildes («guia de remision») | usuaria | 6,000 | 100 ms | 131 ms | 147 ms | 1 s | Sí |
| Búsqueda de un documento concreto («N° 031416») | usuaria | 1 | 79 ms | 114 ms | 117 ms | 1 s | Sí |
| El mismo, de una categoría restringida sin acceso («N° 031415») | usuaria | 0 | 81 ms | 120 ms | 121 ms | 1 s | Sí |
| Filtro por categoría (Facturas) | usuaria | 6,000 | 12 ms | 15 ms | 26 ms | 1 s | Sí |
| Filtro por categoría restringida con acceso (Planillas) | usuaria | 6,000 | 12 ms | 14 ms | 14 ms | 1 s | Sí |
| Filtro por fechas (un trimestre) | usuaria | 2,808 | 16 ms | 23 ms | 27 ms | 1 s | Sí |
| Nombre, categoría y fechas a la vez | usuaria | 534 | 30 ms | 43 ms | 72 ms | 1 s | Sí |
| Ordenado por nombre | usuaria | 42,750 | 58 ms | 80 ms | 96 ms | 1 s | Sí |
| Por palabras y su raíz, por relevancia («facturas textiles») | usuaria | 2,000 | 91 ms | 114 ms | 120 ms | 1 s | Sí |
| Solo en la descripción («medicion carga») | usuaria | 14,250 | 135 ms | 217 ms | 220 ms | 1 s | Sí |
| Con errores de escritura: segunda pasada por parecido («factrua textiles») | usuaria | 2,000 | 533 ms | 606 ms | 626 ms | 1 s | Sí |
| Sugerencias mientras se escribe («guia rem») | usuaria | 5 | 50 ms | 78 ms | 80 ms | 1 s | Sí |
| Sugerencias de un documento concreto («031416») | usuaria | 1 | 41 ms | 54 ms | 57 ms | 1 s | Sí |
| Filtro por estado de aprobación (pendientes) | usuaria | 1,250 | 55 ms | 85 ms | 87 ms | 1 s | Sí |
| Filtro por tipo (fotos) | usuaria | 6,107 | 32 ms | 45 ms | 45 ms | 1 s | Sí |
| Texto, tipo, estado y fecha de subida a la vez | usuaria | 0 | 339 ms | 371 ms | 376 ms | 1 s | Sí |
| Página 500 del listado | usuaria | 42,750 | 70 ms | 99 ms | 109 ms | 1 s | Sí |
| Historial: primera página | administradora | 200,435 | 33 ms | 40 ms | 40 ms | 1 s | Sí |
| Historial filtrado por una semana | administradora | 2,016 | 13 ms | 16 ms | 17 ms | 1 s | Sí |
| Historial imprimible: seis días enteros | administradora | 1,728 | 44 ms | 62 ms | 62 ms | 5 s | Sí |
| Listado documental completo en CSV | administradora | 49,000 | 567 ms | 580 ms | 580 ms | 5 s | Sí |
| Listado documental completo en Excel | administradora | — | 1584 ms | 1654 ms | 1654 ms | 5 s | Sí |

## Lo que encontró

La primera ejecución, el 7 de octubre de 2026, se hizo con la política de visibilidad de la migración 004, que
llamaba a `puede_ver_categoria()` en cada fila. Una función `SECURITY DEFINER` no se integra en la consulta,
y cada página la evaluaba dos veces por documento (para el total y para la página):

| Escenario | Con la política de la 004 (mediana) | Con la de la 010 (mediana) |
|---|---:|---:|
| Listado inicial de la usuaria | 1948 ms | 17 ms |
| Listado inicial de la administradora | 925 ms | 17 ms |
| Búsqueda por nombre de la usuaria | 3846 ms (`guia remision`) | 100 ms |

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
| Búsqueda por nombre, sin tildes («guia de remision») | 282 ms | 100 ms |
| Búsqueda de un documento concreto («N° 031416») | 285 ms | 79 ms |
| Ordenado por nombre | 159 ms | 58 ms |
| Listado documental completo en CSV | 791 ms | 567 ms |

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
<summary>Listado inicial de la usuaria (total): Execution Time: 9.003 ms</summary>

```
Aggregate (actual time=8.969..8.970 rows=1 loops=1)
  Buffers: shared hit=42
  InitPlan 1
    ->  Result (actual time=0.341..0.342 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=0.408..6.954 rows=42750 loops=1)
        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
        Buffers: shared hit=42
        ->  Index Only Scan using documentos_por_categoria on documentos d (actual time=0.361..3.819 rows=42750 loops=1)
              Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
              Heap Fetches: 0
              Buffers: shared hit=42
Planning Time: 0.125 ms
Execution Time: 9.003 ms
```

</details>

<details>
<summary>Listado inicial de la usuaria (página): Execution Time: 1.119 ms</summary>

```
Limit (actual time=1.069..1.073 rows=20 loops=1)
  Buffers: shared hit=48
  InitPlan 1
    ->  Result (actual time=0.327..0.328 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Incremental Sort (actual time=1.068..1.070 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Presorted Key: d.creado_en
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 30kB  Peak Memory: 30kB
        Buffers: shared hit=48
        ->  Result (actual time=0.997..1.052 rows=21 loops=1)
              One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
              Buffers: shared hit=48
              ->  Nested Loop (actual time=0.952..1.004 rows=21 loops=1)
                    Join Filter: (c.id = d.categoria_id)
                    Rows Removed by Join Filter: 105
                    Buffers: shared hit=48
                    ->  Nested Loop (actual time=0.357..0.392 rows=21 loops=1)
                          Buffers: shared hit=28
                          ->  Index Scan using documentos_recientes on documentos d (actual time=0.348..0.356 rows=21 loops=1)
                                Index Cond: (empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                Filter: (categoria_id = ANY ((InitPlan 1).col1))
                                Rows Removed by Filter: 3
                                Buffers: shared hit=8
                          ->  Memoize (actual time=0.001..0.001 rows=1 loops=21)
                                Cache Key: d.subido_por
                                Cache Mode: logical
                                Hits: 11  Misses: 10  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                Buffers: shared hit=20
                                ->  Index Scan using usuarios_id_empresa on usuarios u (actual time=0.001..0.001 rows=1 loops=10)
                                      Index Cond: ((id = d.subido_por) AND (empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.012..0.028 rows=6 loops=21)
                          Buffers: shared hit=20
                          ->  Seq Scan on categorias c (actual time=0.244..0.586 rows=9 loops=1)
                                Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id))
                                Buffers: shared hit=20
Planning:
  Buffers: shared hit=8
Planning Time: 0.386 ms
Execution Time: 1.119 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (total): Execution Time: 33.545 ms</summary>

```
Aggregate (actual time=33.473..33.479 rows=1 loops=1)
  Buffers: shared hit=3563
  InitPlan 3
    ->  Result (actual time=0.288..0.289 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=3.857..33.161 rows=6000 loops=1)
        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
        Buffers: shared hit=3563
        ->  Bitmap Heap Scan on documentos d (actual time=3.817..32.613 rows=6000 loops=1)
              Recheck Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%guia%'::text) OR (busqueda @@ '''gui'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%remision%'::text) OR (busqueda @@ '''remision'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 36750
              Heap Blocks: exact=3499
              Buffers: shared hit=3563
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.533..2.533 rows=42750 loops=1)
                    Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=41
              SubPlan 1
                ->  Result (actual time=0.531..0.849 rows=1 loops=1)
                      One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.499..0.817 rows=1 loops=1)
                            Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%guia%'::text))
                            Rows Removed by Filter: 17
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (never executed)
                      One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                      ->  Seq Scan on categorias ca_1 (never executed)
                            Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%remision%'::text))
Planning Time: 0.333 ms
Execution Time: 33.545 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (página): Execution Time: 53.086 ms</summary>

```
Limit (actual time=52.975..52.985 rows=20 loops=1)
  Buffers: shared hit=3587
  InitPlan 3
    ->  Result (actual time=0.264..0.264 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=52.973..52.979 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'guia de remision'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'guia de remision%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%guia%'::text) AND (d.busqueda_nombre ~~ '%remision%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%guia%'::text) OR (d.busqueda @@ '''gui'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%remision%'::text) OR (d.busqueda @@ '''remision'':*'::tsquery))) THEN 5 ELSE 6 END), (ts_rank(d.busqueda, '''gui'':* | ''remision'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=3587
        ->  Result (actual time=4.697..40.510 rows=6000 loops=1)
              One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
              Buffers: shared hit=3587
              ->  Hash Join (actual time=4.645..37.846 rows=6000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=3587
                    ->  Hash Join (actual time=4.628..36.575 rows=6000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=3586
                          ->  Bitmap Heap Scan on documentos d (actual time=3.962..34.514 rows=6000 loops=1)
                                Recheck Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%guia%'::text) OR (busqueda @@ '''gui'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%remision%'::text) OR (busqueda @@ '''remision'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 36750
                                Heap Blocks: exact=3499
                                Buffers: shared hit=3563
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.493..2.493 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=41
                                SubPlan 1
                                  ->  Result (actual time=0.649..0.950 rows=1 loops=1)
                                        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.589..0.889 rows=1 loops=1)
                                              Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%guia%'::text))
                                              Rows Removed by Filter: 17
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (never executed)
                                        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                        ->  Seq Scan on categorias ca_1 (never executed)
                                              Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%remision%'::text))
                          ->  Hash (actual time=0.660..0.661 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.250..0.656 rows=9 loops=1)
                                      Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.012..0.013 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.007..0.009 rows=11 loops=1)
                                Filter: (empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=8
Planning Time: 0.622 ms
Execution Time: 53.086 ms
```

</details>

<details>
<summary>Búsqueda por relevancia de la usuaria (total): Execution Time: 45.390 ms</summary>

```
Aggregate (actual time=45.307..45.313 rows=1 loops=1)
  Buffers: shared hit=3586
  InitPlan 3
    ->  Result (actual time=0.441..0.442 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=5.591..45.035 rows=2000 loops=1)
        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
        Buffers: shared hit=3586
        ->  Bitmap Heap Scan on documentos d (actual time=5.530..44.787 rows=2000 loops=1)
              Recheck Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%facturas%'::text) OR (busqueda @@ '''factur'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
              Rows Removed by Filter: 40750
              Heap Blocks: exact=3499
              Buffers: shared hit=3586
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=3.027..3.027 rows=42750 loops=1)
                    Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=41
              SubPlan 1
                ->  Result (actual time=0.887..1.358 rows=2 loops=1)
                      One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.671..1.141 rows=2 loops=1)
                            Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%facturas%'::text))
                            Rows Removed by Filter: 16
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (actual time=0.624..0.624 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca_1 (actual time=0.608..0.608 rows=0 loops=1)
                            Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
Planning Time: 0.262 ms
Execution Time: 45.390 ms
```

</details>

<details>
<summary>Búsqueda por relevancia de la usuaria (página): Execution Time: 42.443 ms</summary>

```
Limit (actual time=42.326..42.338 rows=20 loops=1)
  Buffers: shared hit=3610
  InitPlan 3
    ->  Result (actual time=0.295..0.296 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=42.324..42.332 rows=20 loops=1)
        Sort Key: (CASE WHEN (d.busqueda_nombre = 'facturas textiles'::text) THEN 1 WHEN (d.busqueda_nombre ~~ 'facturas textiles%'::text) THEN 2 WHEN ((d.busqueda_nombre ~~ '%facturas%'::text) AND (d.busqueda_nombre ~~ '%textiles%'::text)) THEN 3 WHEN (((d.busqueda_nombre ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*A'::tsquery)) AND ((d.busqueda_nombre ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*A'::tsquery))) THEN 4 WHEN (((d.busqueda_texto ~~ '%facturas%'::text) OR (d.busqueda @@ '''factur'':*'::tsquery)) AND ((d.busqueda_texto ~~ '%textiles%'::text) OR (d.busqueda @@ '''textil'':*'::tsquery))) THEN 5 ELSE 6 END), (ts_rank(d.busqueda, '''factur'':* | ''textil'':*'::tsquery)) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=3610
        ->  Result (actual time=5.092..37.956 rows=2000 loops=1)
              One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
              Buffers: shared hit=3610
              ->  Hash Join (actual time=5.041..36.349 rows=2000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=3610
                    ->  Hash Join (actual time=5.024..35.895 rows=2000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=3609
                          ->  Bitmap Heap Scan on documentos d (actual time=4.369..34.745 rows=2000 loops=1)
                                Recheck Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%facturas%'::text) OR (busqueda @@ '''factur'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1))) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1))))
                                Rows Removed by Filter: 40750
                                Heap Blocks: exact=3499
                                Buffers: shared hit=3586
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.551..2.552 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=41
                                SubPlan 1
                                  ->  Result (actual time=0.301..0.668 rows=2 loops=1)
                                        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.265..0.631 rows=2 loops=1)
                                              Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%facturas%'::text))
                                              Rows Removed by Filter: 16
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (actual time=0.662..0.663 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca_1 (actual time=0.648..0.648 rows=0 loops=1)
                                              Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                          ->  Hash (actual time=0.649..0.651 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.252..0.646 rows=9 loops=1)
                                      Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.012..0.013 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.007..0.008 rows=11 loops=1)
                                Filter: (empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=8
Planning Time: 0.576 ms
Execution Time: 42.443 ms
```

</details>

<details>
<summary>Segunda pasada por parecido de la usuaria (total): Execution Time: 203.053 ms</summary>

```
Aggregate (actual time=202.974..202.979 rows=1 loops=1)
  Buffers: shared hit=3586
  InitPlan 3
    ->  Result (actual time=0.298..0.298 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=4.572..202.787 rows=2000 loops=1)
        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
        Buffers: shared hit=3586
        ->  Bitmap Heap Scan on documentos d (actual time=4.528..202.510 rows=2000 loops=1)
              Recheck Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
              Filter: (((busqueda_texto ~~ '%factrua%'::text) OR (busqueda @@ '''factru'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1)) OR (extensions.word_similarity('factrua'::text, busqueda_nombre) >= '0.5'::double precision)) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1)) OR (extensions.word_similarity('textiles'::text, busqueda_nombre) >= '0.5'::double precision)))
              Rows Removed by Filter: 40750
              Heap Blocks: exact=3499
              Buffers: shared hit=3586
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.597..2.597 rows=42750 loops=1)
                    Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                    Buffers: shared hit=41
              SubPlan 1
                ->  Result (actual time=0.753..0.754 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca (actual time=0.717..0.717 rows=0 loops=1)
                            Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%factrua%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
              SubPlan 2
                ->  Result (actual time=0.635..0.636 rows=0 loops=1)
                      One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                      Buffers: shared hit=23
                      ->  Seq Scan on categorias ca_1 (actual time=0.620..0.620 rows=0 loops=1)
                            Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                            Rows Removed by Filter: 18
                            Buffers: shared hit=23
Planning Time: 0.265 ms
Execution Time: 203.053 ms
```

</details>

<details>
<summary>Segunda pasada por parecido de la usuaria (página): Execution Time: 230.667 ms</summary>

```
Limit (actual time=230.552..230.564 rows=20 loops=1)
  Buffers: shared hit=3610
  InitPlan 3
    ->  Result (actual time=0.262..0.263 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=230.550..230.558 rows=20 loops=1)
        Sort Key: ((extensions.word_similarity('factrua'::text, d.busqueda_nombre) + extensions.word_similarity('textiles'::text, d.busqueda_nombre))) DESC, d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=3610
        ->  Result (actual time=5.330..227.851 rows=2000 loops=1)
              One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
              Buffers: shared hit=3610
              ->  Hash Join (actual time=5.275..212.821 rows=2000 loops=1)
                    Hash Cond: (d.subido_por = u.id)
                    Buffers: shared hit=3610
                    ->  Hash Join (actual time=5.257..212.216 rows=2000 loops=1)
                          Hash Cond: (d.categoria_id = c.id)
                          Buffers: shared hit=3609
                          ->  Bitmap Heap Scan on documentos d (actual time=4.529..210.695 rows=2000 loops=1)
                                Recheck Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)) AND (eliminado_en IS NULL))
                                Filter: (((busqueda_texto ~~ '%factrua%'::text) OR (busqueda @@ '''factru'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 1).col1)) OR (extensions.word_similarity('factrua'::text, busqueda_nombre) >= '0.5'::double precision)) AND ((busqueda_texto ~~ '%textiles%'::text) OR (busqueda @@ '''textil'':*'::tsquery) OR (ANY (categoria_id = (hashed SubPlan 2).col1)) OR (extensions.word_similarity('textiles'::text, busqueda_nombre) >= '0.5'::double precision)))
                                Rows Removed by Filter: 40750
                                Heap Blocks: exact=3499
                                Buffers: shared hit=3586
                                ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.596..2.597 rows=42750 loops=1)
                                      Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 3).col1)))
                                      Buffers: shared hit=41
                                SubPlan 1
                                  ->  Result (actual time=0.678..0.679 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca (actual time=0.638..0.638 rows=0 loops=1)
                                              Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%factrua%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                                SubPlan 2
                                  ->  Result (actual time=0.647..0.647 rows=0 loops=1)
                                        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                        Buffers: shared hit=23
                                        ->  Seq Scan on categorias ca_1 (actual time=0.624..0.624 rows=0 loops=1)
                                              Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id) AND (normalizar((nombre)::text) ~~ '%textiles%'::text))
                                              Rows Removed by Filter: 18
                                              Buffers: shared hit=23
                          ->  Hash (actual time=0.722..0.723 rows=9 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=23
                                ->  Seq Scan on categorias c (actual time=0.260..0.718 rows=9 loops=1)
                                      Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id))
                                      Rows Removed by Filter: 9
                                      Buffers: shared hit=23
                    ->  Hash (actual time=0.012..0.013 rows=11 loops=1)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.007..0.010 rows=11 loops=1)
                                Filter: (empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                Rows Removed by Filter: 2
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=8
Planning Time: 0.530 ms
Execution Time: 230.667 ms
```

</details>

<details>
<summary>Filtro por estado de la usuaria (total): Execution Time: 24.874 ms</summary>

```
Aggregate (actual time=24.795..24.803 rows=1 loops=1)
  Buffers: shared hit=3625
  InitPlan 1
    ->  Result (actual time=0.400..0.401 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=7.547..24.720 rows=1250 loops=1)
        One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
        Buffers: shared hit=3625
        ->  Hash Left Join (actual time=7.500..24.569 rows=1250 loops=1)
              Hash Cond: (d.id = ultima.documento_id)
              Filter: ((COALESCE(ultima.estado, 'sin_solicitud'::character varying))::text = 'pendiente'::text)
              Rows Removed by Filter: 41500
              Buffers: shared hit=3625
              ->  Bitmap Heap Scan on documentos d (actual time=3.227..13.813 rows=42750 loops=1)
                    Recheck Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
                    Heap Blocks: exact=3499
                    Buffers: shared hit=3540
                    ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.745..2.745 rows=42750 loops=1)
                          Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                          Buffers: shared hit=41
              ->  Hash (actual time=4.239..4.243 rows=4500 loops=1)
                    Buckets: 8192  Batches: 1  Memory Usage: 318kB
                    Buffers: shared hit=85
                    ->  Subquery Scan on ultima (actual time=2.250..3.567 rows=4500 loops=1)
                          Buffers: shared hit=85
                          ->  Unique (actual time=2.246..3.130 rows=4500 loops=1)
                                Buffers: shared hit=85
                                ->  Sort (actual time=2.244..2.516 rows=4500 loops=1)
                                      Sort Key: s.documento_id, s.creada_en DESC
                                      Sort Method: quicksort  Memory: 439kB
                                      Buffers: shared hit=85
                                      ->  Result (actual time=0.075..1.258 rows=4500 loops=1)
                                            One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                            Buffers: shared hit=85
                                            ->  Seq Scan on solicitudes s (actual time=0.012..0.840 rows=4500 loops=1)
                                                  Filter: (empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                                  Buffers: shared hit=85
Planning Time: 0.263 ms
Execution Time: 24.874 ms
```

</details>

<details>
<summary>Filtro por estado de la usuaria (página): Execution Time: 32.288 ms</summary>

```
Limit (actual time=32.197..32.208 rows=20 loops=1)
  Buffers: shared hit=3646
  InitPlan 1
    ->  Result (actual time=0.357..0.358 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=32.194..32.203 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=3646
        ->  Result (actual time=8.729..31.583 rows=1250 loops=1)
              One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
              Buffers: shared hit=3646
              ->  Nested Loop (actual time=8.682..31.370 rows=1250 loops=1)
                    Join Filter: (u.id = d.subido_por)
                    Rows Removed by Join Filter: 6250
                    Buffers: shared hit=3646
                    ->  Nested Loop (actual time=8.671..30.143 rows=1250 loops=1)
                          Join Filter: (c.id = d.categoria_id)
                          Rows Removed by Join Filter: 6250
                          Buffers: shared hit=3645
                          ->  Hash Left Join (actual time=7.946..28.230 rows=1250 loops=1)
                                Hash Cond: (d.id = ultima.documento_id)
                                Filter: ((COALESCE(ultima.estado, 'sin_solicitud'::character varying))::text = 'pendiente'::text)
                                Rows Removed by Filter: 41500
                                Buffers: shared hit=3625
                                ->  Bitmap Heap Scan on documentos d (actual time=3.185..14.957 rows=42750 loops=1)
                                      Recheck Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
                                      Heap Blocks: exact=3499
                                      Buffers: shared hit=3540
                                      ->  Bitmap Index Scan on documentos_por_categoria (actual time=2.753..2.753 rows=42750 loops=1)
                                            Index Cond: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                                            Buffers: shared hit=41
                                ->  Hash (actual time=4.726..4.730 rows=4500 loops=1)
                                      Buckets: 8192  Batches: 1  Memory Usage: 318kB
                                      Buffers: shared hit=85
                                      ->  Subquery Scan on ultima (actual time=2.430..4.001 rows=4500 loops=1)
                                            Buffers: shared hit=85
                                            ->  Unique (actual time=2.428..3.546 rows=4500 loops=1)
                                                  Buffers: shared hit=85
                                                  ->  Sort (actual time=2.427..2.825 rows=4500 loops=1)
                                                        Sort Key: s.documento_id, s.creada_en DESC
                                                        Sort Method: quicksort  Memory: 439kB
                                                        Buffers: shared hit=85
                                                        ->  Result (actual time=0.086..1.379 rows=4500 loops=1)
                                                              One-Time Filter: (empresa_actual() = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                                              Buffers: shared hit=85
                                                              ->  Seq Scan on solicitudes s (actual time=0.034..0.937 rows=4500 loops=1)
                                                                    Filter: (empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                                                    Buffers: shared hit=85
                          ->  Materialize (actual time=0.000..0.001 rows=6 loops=1250)
                                Buffers: shared hit=20
                                ->  Seq Scan on categorias c (actual time=0.406..0.715 rows=9 loops=1)
                                      Filter: ((empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid) AND puede_ver_categoria(id))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.000..0.000 rows=6 loops=1250)
                          Buffers: shared hit=1
                          ->  Seq Scan on usuarios u (actual time=0.006..0.007 rows=9 loops=1)
                                Filter: (empresa_id = '938c82f4-78ec-4d23-850e-bef6c582a95e'::uuid)
                                Rows Removed by Filter: 1
                                Buffers: shared hit=1
Planning:
  Buffers: shared hit=8
Planning Time: 0.568 ms
Execution Time: 32.288 ms
```

</details>
