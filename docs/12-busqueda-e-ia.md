# 12 · Búsqueda con inteligencia artificial: comparación y recomendación

El pedido de octubre de 2026 (verificación del correo y buscador avanzado) dejó la IA como opcional:
primero una búsqueda avanzada convencional, después una comparación objetiva para decidir si conviene la
búsqueda semántica. Este documento es esa comparación. No trae código.

**Recomendación:**

- Durante la tesis, la búsqueda se queda como está (A, D42): sin IA y sin leer el contenido de los archivos.
- Si las búsquedas fallidas de la evaluación lo justifican (§5), el paso siguiente es una prueba de concepto
  aislada de la búsqueda en el contenido de PDF y DOCX, sin OCR (C). La búsqueda semántica (B) iría después (D43).

## 1. Qué resuelve hoy la búsqueda y qué no

La búsqueda de la migración 014 (D42) trabaja con lo que el sistema ya sabe de cada documento:

- el nombre y el nombre del archivo;
- la descripción y la categoría;
- el tipo y las fechas;
- el estado de aprobación y quién lo subió.

| Lo que alguien escribe | ¿Lo encuentra? | Por qué |
|---|---|---|
| «facturas proveedores», buscando «Factura de proveedor - octubre.pdf» | Sí | Por la raíz de cada palabra, en cualquier orden |
| «contra» o «0245» | Sí | Como parte de una palabra: «contrato», «F001-0245» |
| «CONTRATO» o «cotizacion» | Sí | Ignora mayúsculas y tildes |
| «factrua provedor» | Sí, marcado como parecido | Hace una segunda pasada por similitud, solo si no hubo resultados exactos |
| «legal», buscando un contrato de la categoría Legal | Sí | Por el nombre de la categoría |
| El RUC o el nombre de un cliente que solo figura **dentro** del PDF | No | El archivo nunca se lee |
| «arrendamiento», buscando «Contrato de alquiler» | No | Son otras palabras, y la raíz no las une |
| «GR», buscando «Guía de remisión» | No | Son siglas propias de cada empresa |
| Lo que dice una foto o un escaneo | No | No tiene texto; haría falta OCR |
| «el contrato que vence en diciembre» | Solo si «contrato» y «diciembre» están en el nombre o la descripción | Es una pregunta, no una lista de palabras |

Para las filas del «No», la descripción ya ofrece una salida sin programar nada. Quien sube un documento puede
anotar ahí el RUC, el cliente o la palabra con la que lo buscaría, y la búsqueda lo encuentra.

Todavía nadie sabe cuántas búsquedas reales caen en las filas del «No», porque el sistema aún no tiene uso
real. Se sabrá después de la evaluación: cada búsqueda queda registrada con su texto y su número de
resultados (§5).

## 2. Las tres alternativas

- **A · Búsqueda tradicional mejorada.** Es la actual (D42), sin cambios.
- **B · Búsqueda semántica con embeddings.** Un modelo convierte en un vector de números el texto de cada
  documento y el de cada búsqueda. Devuelve los documentos cuyo vector queda más cerca, así que encuentra por el
  sentido aunque las palabras no coincidan.
- **C · Búsqueda en el contenido de PDF y DOCX.** Al subir un archivo se extrae su texto y se suma a lo que ya se
  busca, con menos peso que el nombre. Con OCR alcanzaría también a las fotos y los escaneos.

### 2.1 Qué problema resuelve

- **A:** encontrar un documento por lo que se sabe de él, combinado con filtros:
  - palabras de su nombre o su descripción, en cualquier orden;
  - con o sin tildes, en plural o en singular;
  - con un error de escritura pequeño.

  Es exactamente lo que miden los indicadores 2 y 3.
- **B:** encontrar por el sentido:
  - sinónimos, como «arrendamiento» y «alquiler»;
  - otras maneras de decir lo mismo;
  - preguntas en lenguaje natural.

  No encuentra mejor un número exacto: un RUC o «F001-0245» se buscan mejor con A.
- **C:** encontrar por lo que dice el archivo: el RUC de una factura, el cliente de un contrato o un monto.
  - **Sin OCR**, alcanza a los PDF con texto y a los Word (DOCX); Excel necesitaría otro lector.
  - **Con OCR**, alcanza también a las fotos y los escaneos, frecuentes en una MYPE. Para ellos existe «Tomar foto» (D36).

### 2.2 Qué información procesa

- **A:** solo lo que la base ya guarda de cada documento. El archivo no se lee.
- **B:** convierte en vector un texto por documento: el nombre y la descripción o, para que valga la pena,
  también el contenido. Además convierte cada búsqueda en el momento de escribirla.
- **C:** procesa el texto completo de cada archivo y de cada versión (D30). Con OCR, también las imágenes.

### 2.3 Qué cambia en la arquitectura

- **A:** nada más. Ya está en producción con la migración 014, que añadió tres columnas generadas.
- **B:**
  - Hay que instalar la extensión `vector`: pgvector 0.8.2 está disponible en el proyecto de Supabase, pero no
    instalado.
  - Una tabla de vectores con `empresa_id`, RLS y la visibilidad por categoría (D22), como toda tabla de negocio.
  - Un paso al subir y al versionar que pida el vector a un modelo. Va fuera de la transacción y con una cola de
    pendientes, para que una subida no falle porque el modelo no responde.
  - Cambiar de modelo obliga a recalcular todos los vectores.
  - Una búsqueda híbrida que mezcle el orden de A con el de B, y que siga funcionando solo con A si el modelo no
    está disponible.
- **C:**
  - Extraer el texto al subir y al versionar, con una librería por formato (PDF, DOCX y quizá XLSX). Son
    dependencias nuevas que leen archivos enviados por cualquier persona.
  - Guardar ese texto en la base, con su RLS, y sumarlo al `tsvector` de la 014 con peso C.
  - Procesar los documentos que ya existen.
  - Con OCR, un motor que no cabe en la duración de una petición, así que necesita una tarea aparte, como la de
    la purga (D23).

### 2.4 Costo operativo

- **A:** 0. No hay nada nuevo que contratar.
- **B:**
  - **Con un modelo externo:** otra cuenta, pago por uso con tarjeta y un secreto más que guardar. Rompe el
    costo 0 de la tesis.
  - **Con un modelo propio dentro de la API:** compite por los 512 MB y la 0,1 CPU de Render gratuito. Ese
    límite ya dejó fuera a una librería de PDF (D32).
- **C:**
  - **Sin OCR:** 0 en dinero, pero el texto ocupa espacio en los 500 MB de la base gratuita (hoy usa 13 MB) y en
    cada respaldo.
  - **Con OCR:** cada página escaneada se procesaría en la CPU de Render. Con 0,1 CPU, estimo decenas de
    segundos por página; no lo medí.

### 2.5 Rendimiento

- **A:** medida con 50.000 documentos, en local (`docs/evidencias/prueba-de-carga.md`):

  | Búsqueda | Mediana |
  |---|---:|
  | Exacta | 98 ms |
  | Por relevancia | 87 ms |
  | Con errores de escritura | unos 500 ms |
  | Sugerencias | 37–47 ms |

  Todos los escenarios quedan bajo 1 s.
- **B:**
  - Cada búsqueda suma calcular el vector de lo escrito: una llamada de red, o segundos en la CPU de Render.
    Cada subida suma otro tanto.
  - El índice de vectores ordena entre los de todas las empresas, y la RLS filtra después. Por eso puede
    devolver menos resultados de los pedidos; pgvector 0.8 tiene recorridos iterativos para eso. Habría que
    medirlo con la misma prueba de carga.
- **C:**
  - El texto a recorrer pasa de un nombre y una descripción a páginas enteras. Como con la RLS la búsqueda no usa
    índices (D42), los 98 ms de hoy crecerían en proporción. Habría que volver a medirlo antes de decidir.
  - Subir un PDF tardaría más, por la extracción del texto.

### 2.6 Riesgos de privacidad

- **A:** ninguno nuevo. Usa los mismos datos que el sistema ya guarda y muestra.
- **B:**
  - **El texto sale a otro proveedor**, si el modelo es externo. Sería una transferencia internacional que hoy no
    figura en el consentimiento (`docs/10`) ni en `/privacidad` (D38), con la retención y el uso que decida ese
    proveedor.
  - **Los vectores revelan parte del contenido**, porque se derivan de él. Por eso tendrían la misma RLS,
    entrarían en los respaldos y los borraría el cierre del estudio (D33).
  - **La similitud no autoriza nada.** Los resultados se filtran por empresa y por categoría antes de mostrarse,
    igual que en A.
- **C:**
  - La base pasaría a guardar el contenido de los documentos, que hoy solo está en el bucket privado.
  - Ese contenido entraría en los respaldos nocturnos (D25), que hoy solo llevan metadatos.
  - Habría que cambiar el consentimiento y `/privacidad`, que describen lo que el sistema guarda.
  - Nada sale a terceros.

### 2.7 Cómo se evalúa su precisión

Se usa el mismo método con las tres, para compararlas en igualdad de condiciones:

1. **Un juego de búsquedas con su documento correcto.** Salen de las tareas del protocolo (`docs/09`) y de los
   40 documentos ficticios (D34). Las escribe alguien que no vea los nombres exactos.
2. **Dos medidas por búsqueda:**
   - si el documento correcto sale en la primera página (20 resultados) y en qué posición;
   - cuántos resultados de esa página no tienen que ver.
3. **Las tres combinaciones:** A sola, A con B y A con C, sobre el mismo juego y la misma base desechable.

A ya tiene dos fuentes de evidencia:

- 18 pruebas automáticas de la búsqueda (`backend/tests/integracion/busqueda.test.ts`);
- el registro de cada búsqueda durante la evaluación (§5).

En B, decidir si un resultado «cercano» es útil exige el juicio de una persona.

### 2.8 Complejidad de mantenimiento

- **A:** una migración y SQL en el repositorio, con sus pruebas. Además, una lista de palabras vacías y dos
  umbrales medidos: 0,5 de similitud y 4 letras para el parecido.
- **B:**
  - la versión del modelo: cambiarla obliga a recalcularlo todo;
  - la cola de pendientes;
  - la disponibilidad, el costo y la clave del proveedor;
  - la mezcla de los dos órdenes, que hay que volver a calibrar.
- **C:**
  - las librerías que leen archivos de cualquiera: cada vulnerabilidad suya es del sistema;
  - el reproceso al subir una versión;
  - el límite de tamaño del texto;
  - con OCR, el idioma y la calidad de las fotos.

### 2.9 ¿Aporta valor real a la tesis?

- **A:** sí, directo. Es lo que miden los indicadores 2 (tiempo de búsqueda) y 3 (recuperación), y deja rastro
  de cada búsqueda.
- **B:** bajo durante la tesis:
  - ningún indicador la pide;
  - `CLAUDE.md` deja la IA fuera del alcance;
  - suma un tercero y un costo.

  Es defendible como trabajo futuro si la evaluación muestra búsquedas que fallan por el sentido.
- **C:** medio. Mejoraría el indicador 3 si las personas buscan por lo que dice el documento. Pero el OCR también
  está fuera del alcance, y sin OCR no cubre las fotos ni los escaneos.

### 2.10 En una tabla

| | A · Tradicional | B · Semántica | C sin OCR | C con OCR |
|---|---|---|---|---|
| Resuelve | Metadatos con variaciones | Sentido y sinónimos | Contenido de PDF y DOCX | Además, fotos y escaneos |
| Procesa | Metadatos | Texto y búsquedas, como vectores | Texto completo | Imágenes |
| Arquitectura | Hecha (014) | Tabla de vectores, cola, búsqueda híbrida | Extracción, columna, reproceso | Además, una tarea aparte |
| Costo | 0 | Pago por uso o RAM de Render | 0; ocupa base y respaldos | 0; mucha CPU |
| Rendimiento | Medido: 98 ms con 50.000 | Una llamada más por búsqueda | Crece con el texto | Subida lenta |
| Privacidad | Sin cambios | El texto sale a un tercero | El contenido entra en la base | Igual que C |
| Mantenimiento | Bajo | Alto | Medio | Alto |
| Valor para la tesis | Directo | Trabajo futuro | Si los datos lo piden | Fuera del alcance |

## 3. Recomendación

Durante la tesis, A, por cinco razones:

1. **Resuelve el ejemplo del pedido y lo prueba:** «facturas proveedores» encuentra «Factura de proveedor -
   octubre».
2. **Está medida:** con 50.000 documentos, todos los escenarios quedan bajo el umbral de 1 s.
3. **Cuesta 0 y no cambia a quién llegan los datos:** el consentimiento sigue diciendo la verdad.
4. **No mete cambios grandes antes del congelamiento (D35):** lo que se evalúa es lo que ya está desplegado y
   probado.
5. **Falta la evidencia para decidir B o C:** el sistema la reunirá solo durante la evaluación (§5).

La descripción cubre, sin código, parte de lo que harían B y C. Si el asesor lo aprueba, la capacitación puede
sugerir anotar ahí el RUC o el cliente (`docs/09`). No sugerirlo también vale: entonces las búsquedas fallidas
mostrarán cuánto falta.

## 4. Si después se agrega

Estas reglas no cambian, se elija lo que se elija:

- **Primero, una prueba de concepto aislada:** una rama, una base desechable, los 40 documentos ficticios y el
  juego de búsquedas de §2.7. Ni producción ni documentos reales.
- **Empezar por C sin OCR:**
  - no manda nada a terceros y cuesta 0;
  - ataca la falla más probable en una MYPE: buscar por el RUC o por el cliente.

  B, solo si después siguen fallando búsquedas por el sentido.
- **A sigue funcionando sola si lo nuevo falla.** B o C suman resultados; no reemplazan la consulta.
- **Nada salta los permisos.** Los vectores o el texto llevan `empresa_id` y RLS, con la visibilidad por
  categoría. La similitud no es autorización.
- **Ningún documento completo sale a una API externa sin dos condiciones previas:**
  - documentar qué se envía, quién lo guarda, cuánto tiempo y para qué;
  - cambiar el consentimiento.
- **Se integra solo si mejora lo medido.** Si A con B, o A con C, no pone más documentos correctos en la primera
  página que A sola, no se integra.

## 5. Cómo decidir con los datos de la evaluación

Cada búsqueda confirmada queda en el historial como `BUSQUEDA_REALIZADA` (RN40), con:

- el texto y los filtros;
- el número de resultados;
- si solo hubo parecidos;
- el documento elegido, si fue una sugerencia.

La consulta siguiente lista cada texto buscado con cuatro columnas:

- **veces:** cuántas veces se buscó;
- **sin_resultados:** cuántas de esas búsquedas no devolvieron nada;
- **solo_parecidos:** cuántas devolvieron solo parecidos;
- **sin_obtener:** cuántas no fueron seguidas de ver o descargar un documento en los 5 minutos siguientes.

Usa el mismo bloque `p` que las consultas de [08 · Indicadores](08-indicadores.md).

```sql
with p as (select '00000000-0000-0000-0000-000000000000'::uuid as empresa,
                  timestamptz '2026-11-10 09:00 America/Lima' as desde,
                  timestamptz '2026-11-10 12:00 America/Lima' as hasta),
busquedas as (
  select h.usuario_id, h.creado_en,
         lower(btrim(h.detalle -> 'filtros' ->> 'q')) as texto,
         (h.detalle ->> 'resultados')::int as resultados,
         h.detalle ? 'aproximada' as solo_parecidos
  from historial h, p
  where h.empresa_id = p.empresa and h.creado_en between p.desde and p.hasta
    and h.accion = 'BUSQUEDA_REALIZADA' and h.detalle -> 'filtros' ? 'q'
)
select b.texto,
       count(*) as veces,
       count(*) filter (where b.resultados = 0) as sin_resultados,
       count(*) filter (where b.solo_parecidos) as solo_parecidos,
       count(*) filter (where not exists (
         select 1 from historial o
         where o.empresa_id = (select empresa from p) and o.usuario_id = b.usuario_id
           and o.accion in ('DOCUMENTO_VISUALIZADO', 'DOCUMENTO_DESCARGADO')
           and o.creado_en between b.creado_en and b.creado_en + interval '5 minutes'
       )) as sin_obtener
from busquedas b
group by b.texto
order by sin_obtener desc, sin_resultados desc, veces desc;
```

La probé el 10 de octubre de 2026 contra una base local con búsquedas ficticias: una encontrada y abierta, dos sin
resultados y una solo con parecidos. Devolvió esos números.

`sin_resultados` es exacta. `sin_obtener` es aproximada: si después de una búsqueda fallida la persona prueba otras
palabras y encuentra el documento, la primera también cuenta como obtenida.

Para cada texto con búsquedas sin resultados o sin documento obtenido, quien evalúa anota la causa, con ayuda de
la ficha de observación (`docs/09` §8):

| Causa | Ejemplo | Qué la resolvería |
|---|---|---|
| El documento no existe, o esa persona no tiene permiso para verlo | Pide uno que no se cargó | Nada: la búsqueda acertó |
| La palabra solo está dentro del archivo | Un RUC | C |
| Otra palabra con el mismo sentido, o una sigla | «arrendamiento», «GR» | La descripción; si no basta, B |
| Un error de escritura que no llegó a parecido | Dos letras cambiadas en una palabra corta | Revisar el umbral de 0,5 |
| Una foto o un escaneo | Un recibo fotografiado | C con OCR, fuera del alcance |

**Regla de decisión, a aprobar con el asesor:**

- Si las búsquedas fallidas que resolverían B o C son menos de una de cada diez búsquedas con texto, A basta. B
  y C quedan como trabajo futuro, con ese dato como argumento.
- Si son más, se hace la prueba de concepto de §4 para la causa más frecuente.

Con pocas personas en la muestra habrá pocas búsquedas. Por eso la decisión se describe con estos conteos, sin
prueba estadística.
