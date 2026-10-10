# Prueba aislada: búsqueda semántica

Generado por `npm run medir` (`experimentos/busqueda-semantica/`) el 10 de octubre de 2026, 1:04 p. m., hora de Lima.

**Pregunta.** ¿La búsqueda semántica con un modelo que corre dentro de la API encuentra documentos que la
búsqueda actual (D42) no encuentra, y cabe en Render gratuito? Es la prueba de concepto aislada de
[12 · Búsqueda e IA §4](../12-busqueda-e-ia.md): no toca producción ni ninguna base real.

**Resultado, en las 37 búsquedas con respuesta correcta:** un documento correcto entre los cinco primeros en
15 con A, 24 con C, 33 con B, 36 con B+, 33 con A→B.
En las 6 búsquedas sin respuesta correcta, devolvieron algo
0 con A, 0 con C, 6 con B, 6 con B+, 6 con A→B.

## Los datos

- 52 documentos ficticios de un taller textil: los 40 del piloto (D34) y 12 de su administración
  (alquiler, luz, contador, impuestos, seguro, licencia, planilla…), de los que 2 son fotos sin texto.
- 43 búsquedas en seis grupos (`busquedas.ts`), cada una con los documentos que una persona aceptaría como
  respuesta. Las escribió quien conoce los documentos, lo que favorece a todos los buscadores por igual pero no
  reemplaza búsquedas de personas reales: el archivo se puede ampliar con las de otras personas.
- Ningún dato es real ni sale de esta máquina.

## Cómo se mide

| Buscador | Qué es |
|---|---|
| A | La búsqueda actual (D42) |
| C | La actual, con el texto del archivo |
| B | Semántica, sobre el nombre, la categoría y la descripción |
| B+ | Semántica, además sobre el texto del archivo |
| A→B | La actual y, solo si no encuentra nada, la semántica |

- **A y C** son la búsqueda de producción, con su código, sus migraciones y su RLS, en un PostgreSQL desechable;
  cada una es una empresa. En C el texto de cada archivo va en la descripción: así se vería la búsqueda en el
  contenido si se extrajera al subir (en producción iría con menos peso que la descripción).
- **B y B+** usan `Xenova/multilingual-e5-small` cuantizado a 8 bits, en este proceso: el nombre, la categoría y la descripción
  de cada documento (B), más el texto del archivo (B+), convertidos en vectores; cada búsqueda devuelve los cinco
  más parecidos. Sin umbral: siempre devuelve cinco.
- **A→B** muestra lo de A y, solo si A no encuentra nada, lo de B, como la pasada por parecido de D42.
- Se miran los **5 primeros resultados**: lo que muestran las sugerencias y lo que se ve sin desplazarse
  en el celular.

## Resultados

Búsquedas con un correcto entre los cinco primeros:

| Grupo | Búsquedas | A | C | B | B+ | A→B |
|---|---:|---:|---:|---:|---:|---:|
| Por el nombre (control) | 8 | 8 de 8 | 8 de 8 | 8 de 8 | 8 de 8 | 8 de 8 |
| Con otra palabra | 13 | 0 de 13 | 3 de 13 | 12 de 13 | 13 de 13 | 12 de 13 |
| Por lo que dice el documento | 8 | 2 de 8 | 8 de 8 | 6 de 8 | 8 de 8 | 6 de 8 |
| Con errores de escritura | 6 | 5 de 6 | 5 de 6 | 6 de 6 | 6 de 6 | 6 de 6 |
| Fotos sin texto | 2 | 0 de 2 | 0 de 2 | 1 de 2 | 1 de 2 | 1 de 2 |
| **Todas con respuesta** | 37 | **15 de 37** | **24 de 37** | **33 de 37** | **36 de 37** | **33 de 37** |

Búsquedas con un correcto en el primer lugar:

| Grupo | Búsquedas | A | C | B | B+ | A→B |
|---|---:|---:|---:|---:|---:|---:|
| Por el nombre (control) | 8 | 8 de 8 | 8 de 8 | 8 de 8 | 6 de 8 | 8 de 8 |
| Con otra palabra | 13 | 0 de 13 | 3 de 13 | 9 de 13 | 9 de 13 | 9 de 13 |
| Por lo que dice el documento | 8 | 2 de 8 | 8 de 8 | 4 de 8 | 7 de 8 | 4 de 8 |
| Con errores de escritura | 6 | 5 de 6 | 5 de 6 | 6 de 6 | 5 de 6 | 6 de 6 |
| Fotos sin texto | 2 | 0 de 2 | 0 de 2 | 0 de 2 | 0 de 2 | 0 de 2 |
| **Todas con respuesta** | 37 | **15 de 37** | **24 de 37** | **27 de 37** | **27 de 37** | **27 de 37** |

Rango recíproco medio (MRR: 1 si el primer correcto está primero, 0,5 si está segundo… y 0 si no está entre los cinco):

| Grupo | Búsquedas | A | C | B | B+ | A→B |
|---|---:|---:|---:|---:|---:|---:|
| Por el nombre (control) | 8 | 1.00 | 1.00 | 1.00 | 0.81 | 1.00 |
| Con otra palabra | 13 | 0.00 | 0.23 | 0.77 | 0.81 | 0.77 |
| Por lo que dice el documento | 8 | 0.25 | 1.00 | 0.57 | 0.92 | 0.57 |
| Con errores de escritura | 6 | 0.83 | 0.83 | 1.00 | 0.92 | 1.00 |
| Fotos sin texto | 2 | 0.00 | 0.00 | 0.17 | 0.13 | 0.17 |
| **Todas con respuesta** | 37 | **0.41** | **0.65** | **0.78** | **0.81** | **0.78** |

### Sin respuesta correcta

Lo que devuelve cada buscador cuando no hay ningún documento que sirva. Devolver algo es un falso positivo.

| Búsqueda | A | C | B | B+ | A→B | Similitud del primero en B |
|---|---:|---:|---:|---:|---:|---:|
| «recibo de agua» | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ | 0.853 |
| «préstamo bancario» | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ | 0.829 |
| «vacaciones del personal» | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ | 0.835 |
| «exportación a Chile» | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ | 0.833 |
| «multa de tránsito» | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ | 0.831 |
| «auditoría externa» | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ | 0.851 |

¿Un umbral de similitud separaría lo correcto de lo inventado? Cuando B acierta en el primer lugar, la similitud de ese primero va desde 0.831; en las búsquedas sin
respuesta, la del primero llega a 0.853. Los rangos se superponen: ningún umbral descarta todo lo inventado sin perder aciertos.

## Recursos

Medido en este equipo: Intel(R) Xeon(R) Processor @ 2.80GHz, 4 núcleos, 16 GB, Node v22.22.0.
El tiempo en Render se estima dividiendo el tiempo de CPU entre los 0.1 CPU del plan gratuito.

| Medida | Valor |
|---|---:|
| Modelo en disco | 129 MB |
| Carga del modelo | 3,912 ms |
| Memoria del proceso antes de cargarlo | 306 MB |
| Memoria del proceso con el modelo cargado | 646 MB |
| **Memoria que suma el modelo** | **339 MB** |
| CPU por documento al subirlo (mediana / p95) | 31 ms / 57 ms |
| CPU por búsqueda (mediana / p95) | 17 ms / 31 ms |
| Estimado en Render por búsqueda (mediana / p95) | 175 ms / 307 ms |

Render gratuito tiene 512 MB de memoria para toda la API. Lo que la API usa hoy en producción se ve en las métricas de
Render; la memoria que suma el modelo se sumaría a eso.

## Cada búsqueda

La posición del primer documento correcto entre los cinco primeros («—» si no hay ninguno). En las búsquedas sin
respuesta, «nada ✓» o cuántos resultados devolvió.

| Grupo | Búsqueda | Correctos | A | C | B | B+ | A→B |
|---|---|---|---:|---:|---:|---:|---:|
| Por el nombre (control) | «factura F001-000214» | 17 | 1.º | 1.º | 1.º | 5.º | 1.º |
| Por el nombre (control) | «cotización Comercial Ejemplo Gamarra» | 05, 29 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Por el nombre (control) | «guía de remisión Boutique Lucero» | 27, 35 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Por el nombre (control) | «contrato de alquiler» | 41 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Por el nombre (control) | «planilla febrero» | 47 | 1.º | 1.º | 1.º | 4.º | 1.º |
| Por el nombre (control) | «acta de reunión» | 08, 16, 24, 32, 40 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Por el nombre (control) | «orden de compra Moda Simulada» | 28 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Por el nombre (control) | «recibo de luz» | 42 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Con otra palabra | «presupuesto para Uniformes de Muestra» | 13, 37 | — | — | 4.º | 3.º | 4.º |
| Con otra palabra | «certificado laboral» | 07, 15, 23, 31, 39 | — | — | 2.º | 2.º | 2.º |
| Con otra palabra | «despacho de mercadería a Tienda Demostración Sur» | 11 | — | — | 4.º | 4.º | 4.º |
| Con otra palabra | «arrendamiento del local» | 41 | — | 1.º | 1.º | 1.º | 1.º |
| Con otra palabra | «pedido de compra de Distribuidora Norte» | 04 | — | — | 1.º | 1.º | 1.º |
| Con otra palabra | «comprobantes de venta de Comercial Ejemplo Gamarra» | 02, 26 | — | — | 1.º | 1.º | 1.º |
| Con otra palabra | «pago al contador» | 43 | — | — | 1.º | 1.º | 1.º |
| Con otra palabra | «impuestos de febrero» | 44 | — | 1.º | 1.º | 1.º | 1.º |
| Con otra palabra | «seguro del taller» | 45 | — | 1.º | 1.º | 1.º | 1.º |
| Con otra palabra | «permiso municipal» | 46 | — | — | 1.º | 1.º | 1.º |
| Con otra palabra | «sueldos de los trabajadores» | 47 | — | — | 1.º | 1.º | 1.º |
| Con otra palabra | «reparación de las máquinas» | 50 | — | — | 1.º | 1.º | 1.º |
| Con otra palabra | «acuerdo con Boutique Lucero» | 22, 38 | — | — | — | 2.º | — |
| Por lo que dice el documento | «chompas de alpaca» | 20, 29, 36, 37 | — | 1.º | — | 1.º | — |
| Por lo que dice el documento | «ordenar el almacén de telas» | 08, 16, 24, 32, 40 | — | 1.º | — | 3.º | — |
| Por lo que dice el documento | «colaborador C-35» | 07 | — | 1.º | 5.º | 1.º | 5.º |
| Por lo que dice el documento | «casaca polar Boutique Lucero» | 21, 35 | — | 1.º | 1.º | 1.º | 1.º |
| Por lo que dice el documento | «uniforme escolar» | 05, 17, 33, 34, 35 | — | 1.º | 1.º | 1.º | 1.º |
| Por lo que dice el documento | «renta mensual del local» | 41 | — | 1.º | 3.º | 1.º | 3.º |
| Por lo que dice el documento | «remalladoras» | 48, 50 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Por lo que dice el documento | «tela jersey del proveedor» | 49 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Con errores de escritura | «cotizasion» | 05, 13, 21, 29, 37 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Con errores de escritura | «gia de remision» | 03, 11, 19, 27, 35 | — | — | 1.º | 1.º | 1.º |
| Con errores de escritura | «contrto de alquiler» | 41 | 1.º | 1.º | 1.º | 2.º | 1.º |
| Con errores de escritura | «constansia de trabajo» | 07, 15, 23, 31, 39 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Con errores de escritura | «boutike lucero» | 21, 22, 27, 35, 38 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Con errores de escritura | «fatura Tienda Demostracion» | 01, 33 | 1.º | 1.º | 1.º | 1.º | 1.º |
| Sin respuesta correcta | «recibo de agua» | — | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ |
| Sin respuesta correcta | «préstamo bancario» | — | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ |
| Sin respuesta correcta | «vacaciones del personal» | — | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ |
| Sin respuesta correcta | «exportación a Chile» | — | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ |
| Sin respuesta correcta | «multa de tránsito» | — | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ |
| Sin respuesta correcta | «auditoría externa» | — | nada ✓ | nada ✓ | 5 ✗ | 5 ✗ | 5 ✗ |
| Fotos sin texto | «boleta del flete» | 51 | — | — | 3.º | 4.º | 3.º |
| Fotos sin texto | «carta de reclamo de un cliente» | 52 | — | — | — | — | — |
