# 08 · Cómo obtener cada indicador

El sistema deja rastro de los siete indicadores por sí mismo (CLAUDE.md). Aquí está cómo sacarlos al
cerrar cada sesión de evaluación: [01 · Análisis §8](01-analisis.md) define qué mide cada uno y qué
no puede saber el sistema; este documento da las consultas.

Para un vistazo durante la evaluación, el **Tablero** del administrador (*Administración → Tablero*,
RF28) muestra, para el periodo que se elija, lo que el sistema registra de cada indicador: subidas y
ediciones, búsquedas, documentos obtenidos, acciones en el historial, el éxito de los accesos desde el
celular, los accesos denegados y la mediana y el percentil 95 del tiempo de respuesta. Para el capítulo 3
valen las fuentes siguientes, que se pueden guardar y repetir.

Hay dos fuentes:

- **El CSV del historial**, que cualquier administrador de la empresa exporta desde *Historial →
  Exportar a CSV*, con los filtros de fecha de la sesión. Excel lo abre con las tildes bien.
- **Consultas de solo lectura** en el editor SQL de Supabase (*SQL Editor*), para los cálculos y para
  `tiempos_respuesta`, que no tiene pantalla.

Las consultas se probaron contra la base local con los datos de las pruebas.

## Parámetros

Cada consulta empieza con el mismo bloque `p`: la empresa evaluada y la ventana de la sesión, en hora
de Lima. Cambia esos tres valores antes de ejecutarla. El id de la empresa está en la barra de
direcciones del Master, en la ficha de la empresa (`/plataforma/empresas/<id>`).

## 1 · Tiempo de organización y categorización

Tiempo entre la primera y la última subida o edición de cada persona. El cronómetro es la fuente
principal, porque el sistema no sabe cuándo empezó la persona a leer la consigna; esto lo corrobora.

```sql
with p as (select '00000000-0000-0000-0000-000000000000'::uuid as empresa,
                  timestamptz '2026-11-10 09:00 America/Lima' as desde,
                  timestamptz '2026-11-10 12:00 America/Lima' as hasta)
select u.nombre,
       min(h.creado_en) at time zone 'America/Lima' as primera_accion,
       max(h.creado_en) at time zone 'America/Lima' as ultima_accion,
       round(extract(epoch from max(h.creado_en) - min(h.creado_en))) as segundos,
       count(*) as acciones
from historial h join usuarios u on u.id = h.usuario_id, p
where h.empresa_id = p.empresa and h.creado_en between p.desde and p.hasta
  and h.accion in ('DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO')
group by u.nombre order by u.nombre;
```

## 2 · Tiempo de búsqueda

Para cada documento obtenido, segundos desde la primera consulta del listado de esa persona hasta que
lo vio o lo descargó. Cuenta también a quien lo encontró recorriendo el listado sin filtrar.

```sql
with p as (select '00000000-0000-0000-0000-000000000000'::uuid as empresa,
                  timestamptz '2026-11-10 09:00 America/Lima' as desde,
                  timestamptz '2026-11-10 12:00 America/Lima' as hasta),
consultas as (
  select t.usuario_id, t.creado_en from tiempos_respuesta t, p
  where t.empresa_id = p.empresa and t.creado_en between p.desde and p.hasta
), obtenciones as (
  select h.usuario_id, h.entidad_id as documento_id, h.detalle ->> 'nombre' as documento, min(h.creado_en) as obtenido_en
  from historial h, p
  where h.empresa_id = p.empresa and h.creado_en between p.desde and p.hasta
    and h.accion in ('DOCUMENTO_VISUALIZADO', 'DOCUMENTO_DESCARGADO')
  group by h.usuario_id, h.entidad_id, h.detalle ->> 'nombre'
)
select u.nombre, o.documento,
       round(extract(epoch from o.obtenido_en - (
         select min(c.creado_en) from consultas c where c.usuario_id = o.usuario_id and c.creado_en <= o.obtenido_en
       ))) as segundos
from obtenciones o join usuarios u on u.id = o.usuario_id
order by u.nombre, o.obtenido_en;
```

Si una persona busca varios documentos en la misma sesión, acota `p.desde` y `p.hasta` a cada tarea.

## 3 · Tasa de recuperación

Los documentos que cada persona obtuvo. Se compara con la lista de documentos pedidos, que fija el
protocolo de prueba: obtenidos de la lista ÷ pedidos.

```sql
with p as (select '00000000-0000-0000-0000-000000000000'::uuid as empresa,
                  timestamptz '2026-11-10 09:00 America/Lima' as desde,
                  timestamptz '2026-11-10 12:00 America/Lima' as hasta)
select distinct u.nombre, h.entidad_id as documento_id, h.detalle ->> 'nombre' as documento
from historial h join usuarios u on u.id = h.usuario_id, p
where h.empresa_id = p.empresa and h.creado_en between p.desde and p.hasta
  and h.accion in ('DOCUMENTO_VISUALIZADO', 'DOCUMENTO_DESCARGADO')
order by u.nombre, documento;
```

## 4 · Acciones registradas en el historial

Las acciones registradas, por tipo. Se dividen entre las que el guion de la sesión hizo ejecutar.

```sql
with p as (select '00000000-0000-0000-0000-000000000000'::uuid as empresa,
                  timestamptz '2026-11-10 09:00 America/Lima' as desde,
                  timestamptz '2026-11-10 12:00 America/Lima' as hasta)
select h.accion, count(*) as registradas
from historial h, p
where h.empresa_id = p.empresa and h.creado_en between p.desde and p.hasta
group by h.accion order by h.accion;
```

## 5 · Accesibilidad remota

Inicios de sesión exitosos desde un móvil ÷ intentos desde un móvil. Los intentos que nunca llegaron
al servidor (sin cobertura, servicio caído) los anota el evaluador y se suman al denominador.

```sql
with p as (select '00000000-0000-0000-0000-000000000000'::uuid as empresa,
                  timestamptz '2026-11-10 09:00 America/Lima' as desde,
                  timestamptz '2026-11-10 12:00 America/Lima' as hasta)
select count(*) filter (where h.accion = 'SESION_INICIADA') as accesos_exitosos,
       count(*) as intentos,
       round(100.0 * count(*) filter (where h.accion = 'SESION_INICIADA') / nullif(count(*), 0), 1) as porcentaje
from historial h, p
where h.empresa_id = p.empresa and h.creado_en between p.desde and p.hasta
  and h.es_movil and h.accion in ('SESION_INICIADA', 'SESION_FALLIDA');
```

Un intento con un correo que no existe no pertenece a ninguna empresa: no aparece aquí, y lo anota el
evaluador.

## 6 · Accesos correctos según rol

Dos evidencias:

- Dentro de la empresa, los accesos que la API negó, con qué se exigía y dónde. Cada caso evaluado se
  compara con la matriz de [01 · Análisis §6](01-analisis.md).

  ```sql
  with p as (select '00000000-0000-0000-0000-000000000000'::uuid as empresa,
                    timestamptz '2026-11-10 09:00 America/Lima' as desde,
                    timestamptz '2026-11-10 12:00 America/Lima' as hasta)
  select h.rol_usuario, h.detalle ->> 'permiso' as exigia, h.detalle ->> 'ruta' as ruta, count(*) as denegados
  from historial h, p
  where h.empresa_id = p.empresa and h.creado_en between p.desde and p.hasta and h.accion = 'ACCESO_DENEGADO'
  group by 1, 2, 3 order by 4 desc;
  ```

- Entre empresas, el [informe de aislamiento](evidencias/aislamiento-entre-empresas.md), que
  regenera `npm run informe:aislamiento` en `backend/`.

## 7 · Tiempo de respuesta

Mediana y percentil 95 del listado de documentos, tal como lo percibió cada persona (desde que se pidió
hasta que estuvo en pantalla), y la parte que se llevó el servidor. RNF05 pide menos de 1 s.

```sql
with p as (select '00000000-0000-0000-0000-000000000000'::uuid as empresa,
                  timestamptz '2026-11-10 09:00 America/Lima' as desde,
                  timestamptz '2026-11-10 12:00 America/Lima' as hasta)
select count(*) as mediciones,
       round(percentile_cont(0.5) within group (order by t.duracion_cliente_ms)) as mediana_ms,
       round(percentile_cont(0.95) within group (order by t.duracion_cliente_ms)) as p95_ms,
       round(percentile_cont(0.5) within group (order by t.duracion_servidor_ms)) as mediana_servidor_ms,
       count(*) filter (where t.duracion_cliente_ms <= 1000) as bajo_un_segundo
from tiempos_respuesta t, p
where t.empresa_id = p.empresa and t.creado_en between p.desde and p.hasta
  and t.duracion_cliente_ms is not null;
```

Una medición sin `duracion_cliente_ms` es una cuyo envío desde el navegador se perdió: tiene la parte
del servidor, pero no cuenta para la mediana percibida.
