# Prueba de carga: 50.000 documentos

Generado por `npm run informe:carga` (backend) el 7 de octubre de 2026, 12:49 p. m., hora de Lima.

**Pregunta.** ¿El listado y la búsqueda siguen por debajo de 1 s (RNF05, indicador 7) cuando una empresa
tiene 50,000 documentos, con categorías restringidas y otra empresa en las mismas tablas?

**Resultado: 15 de 15 escenarios con el percentil 95 dentro de su umbral:** 1 s para listar
y buscar (RNF05) y 5 s para las dos exportaciones, que descargan de una vez todo lo filtrado.

## Los datos

- Empresa medida: 50,000 documentos de un taller textil (facturas, guías, órdenes de compra,
  planillas…) repartidos en 8 categorías, dos de ellas restringidas, con fechas de tres años y medio, su
  versión 1 y uno de cada 50 en la papelera; 200,000 asientos de historial; 11 personas.
- Otra empresa con 10,000 documentos en las mismas tablas.
- Quien mide: la **usuaria** ve una de las dos categorías restringidas, así que la RLS evalúa las dos
  ramas (D22); la **administradora** las ve todas. Carga de los datos: 18 s.

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
| Listado inicial: los 20 más recientes | usuaria | 42,750 | 14 ms | 15 ms | 16 ms | 1 s | Sí |
| Listado inicial: los 20 más recientes | administradora | 49,000 | 13 ms | 16 ms | 17 ms | 1 s | Sí |
| Búsqueda por nombre, sin tildes («guia de remision») | usuaria | 6,000 | 282 ms | 333 ms | 348 ms | 1 s | Sí |
| Búsqueda de un documento concreto («N° 031416») | usuaria | 1 | 285 ms | 364 ms | 376 ms | 1 s | Sí |
| El mismo, de una categoría restringida sin acceso («N° 031415») | usuaria | 0 | 266 ms | 353 ms | 355 ms | 1 s | Sí |
| Filtro por categoría (Facturas) | usuaria | 6,000 | 10 ms | 17 ms | 21 ms | 1 s | Sí |
| Filtro por categoría restringida con acceso (Planillas) | usuaria | 6,000 | 8 ms | 9 ms | 11 ms | 1 s | Sí |
| Filtro por fechas (un trimestre) | usuaria | 2,808 | 13 ms | 22 ms | 69 ms | 1 s | Sí |
| Nombre, categoría y fechas a la vez | usuaria | 534 | 49 ms | 61 ms | 78 ms | 1 s | Sí |
| Ordenado por nombre | usuaria | 42,750 | 159 ms | 178 ms | 201 ms | 1 s | Sí |
| Página 500 del listado | usuaria | 42,750 | 59 ms | 84 ms | 89 ms | 1 s | Sí |
| Historial: primera página | administradora | 200,235 | 28 ms | 30 ms | 31 ms | 1 s | Sí |
| Historial filtrado por una semana | administradora | 2,016 | 9 ms | 10 ms | 11 ms | 1 s | Sí |
| Historial imprimible: seis días enteros | administradora | 1,728 | 40 ms | 102 ms | 102 ms | 5 s | Sí |
| Listado documental completo en CSV | administradora | 49,000 | 791 ms | 869 ms | 869 ms | 5 s | Sí |

## Lo que encontró

La primera ejecución, el 7 de octubre de 2026, se hizo con la política de visibilidad de la migración 004, que
llamaba a `puede_ver_categoria()` en cada fila. Una función `SECURITY DEFINER` no se integra en la consulta,
y cada página la evaluaba dos veces por documento (para el total y para la página):

| Escenario | Con la política de la 004 (mediana) | Con la de la 010 (mediana) |
|---|---:|---:|
| Listado inicial de la usuaria | 1948 ms | 14 ms |
| Listado inicial de la administradora | 925 ms | 13 ms |
| Búsqueda por nombre de la usuaria | 3846 ms (`guia remision`) | 282 ms |

La migración 010 calcula una sola vez por consulta qué categorías ve quien pregunta (`categorias_visibles()`, un
InitPlan) y cada fila solo se compara con esa lista; decide lo mismo que antes (D31).

Queda una limitación conocida: con la RLS activa, la búsqueda por nombre no usa el índice de trigramas, porque
`LIKE` no es *leakproof* y PostgreSQL no lo evalúa antes que las políticas. Recorre los documentos visibles de la
empresa con un índice por categoría: unos 0,3 s con 50.000, lejos del umbral. Si alguna vez hiciera falta, la
salida es una función que busque los identificadores con el índice dentro de la empresa activa.

## Planes de ejecución

Las mismas consultas que ejecuta la API, con el rol `app_empresa` y la identidad de la usuaria: es decir,
con la RLS aplicada.

<details>
<summary>Listado inicial de la usuaria (total): Execution Time: 11.213 ms</summary>

```
Aggregate (actual time=11.177..11.179 rows=1 loops=1)
  Buffers: shared hit=41
  InitPlan 1
    ->  Result (actual time=0.354..0.355 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=0.429..8.829 rows=42750 loops=1)
        One-Time Filter: (empresa_actual() = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid)
        Buffers: shared hit=41
        ->  Index Only Scan using documentos_por_categoria on documentos d (actual time=0.374..4.492 rows=42750 loops=1)
              Index Cond: ((empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
              Heap Fetches: 0
              Buffers: shared hit=41
Planning:
  Buffers: shared hit=1
Planning Time: 0.192 ms
Execution Time: 11.213 ms
```

</details>

<details>
<summary>Listado inicial de la usuaria (página): Execution Time: 1.194 ms</summary>

```
Limit (actual time=1.143..1.148 rows=20 loops=1)
  Buffers: shared hit=48
  InitPlan 1
    ->  Result (actual time=0.408..0.409 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Incremental Sort (actual time=1.142..1.145 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Presorted Key: d.creado_en
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 30kB  Peak Memory: 30kB
        Buffers: shared hit=48
        ->  Result (actual time=1.070..1.128 rows=21 loops=1)
              One-Time Filter: (empresa_actual() = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid)
              Buffers: shared hit=48
              ->  Nested Loop (actual time=1.026..1.081 rows=21 loops=1)
                    Join Filter: (c.id = d.categoria_id)
                    Rows Removed by Join Filter: 105
                    Buffers: shared hit=48
                    ->  Nested Loop (actual time=0.442..0.477 rows=21 loops=1)
                          Buffers: shared hit=28
                          ->  Index Scan using documentos_recientes on documentos d (actual time=0.431..0.442 rows=21 loops=1)
                                Index Cond: (empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid)
                                Filter: (categoria_id = ANY ((InitPlan 1).col1))
                                Rows Removed by Filter: 3
                                Buffers: shared hit=8
                          ->  Memoize (actual time=0.001..0.001 rows=1 loops=21)
                                Cache Key: d.subido_por
                                Cache Mode: logical
                                Hits: 11  Misses: 10  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                Buffers: shared hit=20
                                ->  Index Scan using usuarios_id_empresa on usuarios u (actual time=0.002..0.002 rows=1 loops=10)
                                      Index Cond: ((id = d.subido_por) AND (empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid))
                                      Buffers: shared hit=20
                    ->  Materialize (actual time=0.011..0.028 rows=6 loops=21)
                          Buffers: shared hit=20
                          ->  Seq Scan on categorias c (actual time=0.232..0.574 rows=9 loops=1)
                                Filter: ((empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid) AND puede_ver_categoria(id))
                                Buffers: shared hit=20
Planning:
  Buffers: shared hit=9
Planning Time: 0.425 ms
Execution Time: 1.194 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (total): Execution Time: 140.984 ms</summary>

```
Aggregate (actual time=140.953..140.956 rows=1 loops=1)
  Buffers: shared hit=1963
  InitPlan 1
    ->  Result (actual time=0.315..0.316 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Result (actual time=2.251..140.236 rows=6000 loops=1)
        One-Time Filter: (empresa_actual() = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid)
        Buffers: shared hit=1963
        ->  Bitmap Heap Scan on documentos d (actual time=2.225..139.222 rows=6000 loops=1)
              Recheck Cond: ((empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)) AND (eliminado_en IS NULL))
              Filter: (normalizar((nombre)::text) ~~ '%guia de remision%'::text)
              Rows Removed by Filter: 36750
              Heap Blocks: exact=1923
              Buffers: shared hit=1963
              ->  Bitmap Index Scan on documentos_por_categoria (actual time=1.889..1.889 rows=42750 loops=1)
                    Index Cond: ((empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid) AND (categoria_id = ANY ((InitPlan 1).col1)))
                    Buffers: shared hit=40
Planning:
  Buffers: shared hit=1
Planning Time: 0.161 ms
Execution Time: 140.984 ms
```

</details>

<details>
<summary>Búsqueda por nombre de la usuaria (página): Execution Time: 150.452 ms</summary>

```
Limit (actual time=150.394..150.404 rows=20 loops=1)
  Buffers: shared hit=19533
  InitPlan 1
    ->  Result (actual time=0.254..0.254 rows=1 loops=1)
          Buffers: shared hit=3
  ->  Sort (actual time=150.393..150.399 rows=20 loops=1)
        Sort Key: d.creado_en DESC, d.id
        Sort Method: top-N heapsort  Memory: 35kB
        Buffers: shared hit=19533
        ->  Result (actual time=37.819..147.620 rows=6000 loops=1)
              One-Time Filter: (empresa_actual() = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid)
              Buffers: shared hit=19533
              ->  Nested Loop (actual time=37.775..146.419 rows=6000 loops=1)
                    Join Filter: (u.id = d.subido_por)
                    Rows Removed by Join Filter: 25000
                    Buffers: shared hit=19533
                    ->  Nested Loop (actual time=37.761..134.894 rows=6000 loops=1)
                          Buffers: shared hit=13533
                          ->  Seq Scan on categorias c (actual time=0.298..1.311 rows=9 loops=1)
                                Filter: ((empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid) AND puede_ver_categoria(id))
                                Rows Removed by Filter: 9
                                Buffers: shared hit=23
                          ->  Index Scan using documentos_por_categoria on documentos d (actual time=12.174..14.683 rows=667 loops=9)
                                Index Cond: ((empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid) AND (categoria_id = c.id) AND (categoria_id = ANY ((InitPlan 1).col1)))
                                Filter: (normalizar((nombre)::text) ~~ '%guia de remision%'::text)
                                Rows Removed by Filter: 4083
                                Buffers: shared hit=13507
                    ->  Seq Scan on usuarios u (actual time=0.000..0.001 rows=5 loops=6000)
                          Filter: (empresa_id = '3af141e9-bea1-47b0-98fa-92eed3175b41'::uuid)
                          Rows Removed by Filter: 1
                          Buffers: shared hit=6000
Planning:
  Buffers: shared hit=9
Planning Time: 0.611 ms
Execution Time: 150.452 ms
```

</details>
