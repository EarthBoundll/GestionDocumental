# Prueba aislada: leer el contenido de los documentos

Generado por `npm run medir` (`experimentos/lectura-de-contenido/`) el 11 de octubre de 2026, 1:49 a. m., hora de Lima, con Node v22.22.0.

**Pregunta.** ¿Puede la API leer el texto de los PDF, Word y Excel que se suben, y sacar sus palabras clave, sin
IA, sin OCR, sin mandar nada a terceros y dentro de Render gratuito (512 MB y 0,1 CPU)? Es el paso 1 de la
búsqueda en el contenido: no toca el sistema, ni producción, ni ninguna base real.

**Resultado:** 56 de 56 archivos respondieron lo esperado. La lectura más lenta gastó
56 ms de CPU, unos 561 ms estimados en Render. Cargar el lector suma
16 MB de memoria, y el mayor pico de una lectura fue de
16 MB.

## Los archivos

56 archivos ficticios (`archivos.ts`), que se generan iguales cada vez:

- **40 PDF del piloto** (D34): una página, sin comprimir, con la fuente Helvetica.
- **6 comprobantes electrónicos** (facturas, boletas y una guía de remisión), como los de un
  sistema de facturación: comprimidos, con la fuente incrustada y el detalle en columnas.
- **Un contrato de 41 páginas**, para ver dónde corta el lector.
- **Un escaneo de dos páginas** sin capa de texto, de 5,1 MB, cerca del límite de subida de 10 MB.
- **Un Word y un Excel** generados sin Office, con lo que Word y Excel guardan por dentro: el texto partido en
  trozos, encabezados, tablas, textos comunes y celdas escritas en la hoja.
- **Lo que no tiene texto que leer:** una foto y un Word antiguo (.doc).
- **Lo que intenta romper el lector:** una bomba de compresión (un Word de
  199 KB que se infla a 200 MB), un PDF cortado a la mitad, uno con contraseña y uno falso.

Los RUC tienen el dígito verificador mal a propósito: ninguno es el de una empresa real.

## Cómo se mide

- **Respuesta:** lo que devuelve `leerContenido` (`leer.ts`), el lector que entraría a la API: «leído» con su
  texto, «sin texto», «no se lee» o «ilegible» con el motivo. Nunca lanza un error: el documento se subiría igual.
- **Recuperación:** cuántas palabras de las que se escribieron en el archivo aparecen en el texto leído. Si el
  lector cortó el texto, se compara con el mismo largo del original.
- **CPU:** la mediana de 3 lecturas en un proceso ya caliente; en Render, multiplicada por 10
  porque tiene 0,1 CPU. Es una estimación, no una medición en Render.
- **Memoria:** cada archivo pesado se lee en un proceso nuevo, que informa su pico (`maxRSS`) frente a lo que
  ocupaba antes de leer.
- **Límites del lector:** 20.000 caracteres, 50 páginas, 10 s entre página y página y
  16 MB de XML descomprimido.

## Resultados

### Qué respondió con cada archivo

| # | Archivo | Tamaño | Respuesta | Recuperación | CPU | En Render (est.) | Lo esperado |
|---|---|---:|---|---:|---:|---:|---|
| 41 | factura F001-45 | 23 KB | leído: 594 caracteres, 1 de 1 págs. | 100 % | 18 ms | 178 ms | Sí |
| 42 | factura F001-46 | 22 KB | leído: 547 caracteres, 1 de 1 págs. | 100 % | 21 ms | 210 ms | Sí |
| 43 | factura F001-51 | 23 KB | leído: 584 caracteres, 1 de 1 págs. | 100 % | 11 ms | 105 ms | Sí |
| 44 | boleta B001-1203 | 23 KB | leído: 685 caracteres, 1 de 1 págs. | 100 % | 15 ms | 150 ms | Sí |
| 45 | boleta B001-1250 | 22 KB | leído: 553 caracteres, 1 de 1 págs. | 100 % | 15 ms | 149 ms | Sí |
| 46 | guía de remisión T001-310 | 23 KB | leído: 828 caracteres, 1 de 1 págs. | 100 % | 15 ms | 152 ms | Sí |
| 47 | Contrato de arrendamiento largo | 88 KB | leído: 19.995 caracteres, 6 de 41 págs., cortado por largo | 99 % | 56 ms | 561 ms | Sí |
| 48 | Escaneo de dos páginas, sin texto | 5,1 MB | sin texto (2 págs.) | — | 9,4 ms | 94 ms | Sí |
| 49 | Contrato de servicio en Word | 2,4 KB | leído: 1348 caracteres | 100 % | 0,3 ms | 3,1 ms | Sí |
| 50 | Lista de precios y proveedores en Excel | 2,8 KB | leído: 562 caracteres | 100 % | 0,3 ms | 2,9 ms | Sí |
| 51 | Foto de un recibo (PNG) | 327 KB | no se lee (tipo sin texto) | — | 0,0 ms | 0,0 ms | Sí |
| 52 | Word antiguo (.doc) | 4,0 KB | no se lee (tipo sin texto) | — | 0,0 ms | 0,0 ms | Sí |
| 53 | Bomba: Word que se infla a 200 MB | 199 KB | ilegible: supera el límite de tamaño | — | 13 ms | 128 ms | Sí |
| 54 | PDF cortado a la mitad | 11 KB | ilegible: no es un PDF válido | — | 4,2 ms | 42 ms | Sí |
| 55 | PDF con contraseña | 1,5 KB | ilegible: protegido con contraseña | — | 2,2 ms | 22 ms | Sí |
| 56 | PDF falso (cabecera y ruido) | 49 KB | ilegible: no es un PDF válido | — | 3,9 ms | 39 ms | Sí |

**Los 40 PDF del piloto:** 40 de 40 leídos; recuperación mínima 100 % y mediana
100 %; CPU mediana 2,5 ms y máxima 12 ms.

Palabras leídas que no estaban en el original (pegadas o partidas):
- Ninguna.

### Arranque y memoria

| Medida | Valor |
|---|---:|
| Memoria que suma cargar el lector (unpdf y pdf.js) | 16 MB |
| Tiempo de carga del lector | 264 ms |
| Primera lectura de una factura tras cargar | 74 ms (CPU 105 ms) |

Pico de memoria de cada lectura pesada, en su propio proceso:

| Archivo | Respuesta | Pico sobre lo ya cargado | Pico total del proceso |
|---|---|---:|---:|
| factura F001-45 | leido | 5,7 MB | 100 MB |
| Contrato de arrendamiento largo | leido | 16 MB | 112 MB |
| Escaneo de dos páginas, sin texto | sin_texto | 7,6 MB | 107 MB |
| Contrato de servicio en Word | leido | 5,8 MB | 104 MB |
| Lista de precios y proveedores en Excel | leido | 5,7 MB | 101 MB |
| Bomba: Word que se infla a 200 MB | ilegible | 16 MB | 111 MB |
| PDF cortado a la mitad | ilegible | 5,5 MB | 100 MB |
| PDF con contraseña | ilegible | 1,1 MB | 101 MB |
| PDF falso (cabecera y ruido) | ilegible | 5,3 MB | 100 MB |

### Espacio en la base

Cada texto leído, guardado como lo guardaría el sistema: la columna de texto y su índice de búsqueda en español,
en un PostgreSQL 17 desechable.

| Grupo | Documentos | Caracteres (promedio) | Texto guardado | Índice de búsqueda (`tsvector`) | Por cada 1.000 documentos así |
|---|---:|---:|---:|---:|---:|
| PDF del piloto (D34) | 40 | 378 | 0,4 KB | 0,5 KB | 0,9 MB |
| Comprobantes electrónicos | 6 | 632 | 0,6 KB | 1,0 KB | 1,6 MB |
| Contrato largo | 1 | 19.995 | 1,6 KB | 5,1 KB | 6,5 MB |
| Word (.docx) | 1 | 1348 | 1,3 KB | 1,4 KB | 2,7 MB |
| Excel (.xlsx) | 1 | 562 | 0,6 KB | 1,1 KB | 1,6 MB |

### Palabras clave

Los datos que se reconocen por su forma y las palabras más repetidas, contadas solo en el documento (TF) o
pesando cuánto escasean en el resto (TF-IDF, con los 49 documentos leídos como si fueran una empresa).

| Documento | Datos reconocidos | Más repetidas (TF) | Más repetidas y propias (TF-IDF) |
|---|---|---|---|
| factura F001-45 | RUC 20600000014 · RUC 20600000031 · Comprobante F001-00000045 · Monto S/ 8,923.16 · Monto S/ 7,562.00 · Monto S/ 1,361.16 · Fecha 05/03/2026 | ficticia, factura, electrónica, Prueba, Casaca, polar, capucha, Confecciones | capucha, electrónica, factura, Casaca, polar, azul, marino, Victoria |
| factura F001-46 | RUC 20600000014 · RUC 20600000022 · Comprobante F001-00000046 · Monto S/ 1,893.90 · Monto S/ 1,605.00 · Monto S/ 288.90 · Fecha 12/03/2026 | ficticia, factura, electrónica, Confecciones, Ejemplo, Gamarra, Victoria, Lima | electrónica, factura, talla, ciento, Botones, nácar, ficticia, Victoria |
| factura F001-51 | RUC 20600000014 · RUC 20600000022 · Comprobante F001-00000051 · Monto S/ 2,224.77 · Monto S/ 1,885.40 · Monto S/ 339.37 · Fecha 02/04/2026 | ficticia, factura, electrónica, Confecciones, Ejemplo, Gamarra, Victoria, Lima | electrónica, factura, Cierre, metálico, ciento, Botones, nácar, azul |
| guía de remisión T001-310 | RUC 20600000014 · RUC 20600000049 · Comprobante T001-00000310 · Monto S/ 16,180.16 · Monto S/ 13,712.00 · Monto S/ 2,468.16 · Fecha 05/03/2026 | ficticio, Ejemplo, ficticia, Gamarra, Victoria, guía, remisión, remitente | ficticio, remitente, Punto, Victoria, guía, remisión, electrónica, Gamarra |
| Factura F001-000103 - Tienda Demostración Sur | Comprobante F001-000103 · Monto S/ 810.00 · Monto S/ 528.00 · Monto S/ 240.84 · Fecha 04/01/2025 | prueba, dato, documento, ficticios, Factura, Taller, confecciones, empresa | Tienda, Demostración, Pantalón, drill, Factura, Tela, jersey, dato |
| Contrato de servicio CT-000141 | Comprobante CT-000141 · Fecha 06/03/2025 | prueba, dato, Taller, confección, documento, ficticios, Contrato, servicio | confección, prendas, condiciones, obligan, prueba, Distribuidora, Norte, temporada |
| Contrato de arrendamiento largo | — | cláusula, anexo, arrendatario, local, arrendador, contrato, galería, renta | cláusula, anexo, arrendatario, local, arrendador, galería, renta, días |
| Contrato de servicio en Word | RUC 20600000014 · RUC 20600000022 · Monto S/ 52,800.00 · Monto S/ 62.00 · Monto S/ 28.50 · Fecha 15/02/2026 | contrato, confección, ficticia, arrendatario, entrega, Ejemplo, renta, días | arrendatario, entrega, contrato, confección, renta, días, cuenta, arrendador |
| Lista de precios y proveedores en Excel | RUC 20600000022 · RUC 20600000031 · RUC 20600000049 | Tela, Hilo, Código, Producto, Stock, Polo, algodón, pima | Tela, Hilo, Producto, Stock, Razón, social, Rubro, Avíos |

## Límites de la prueba

- Los archivos son ficticios y generados por programa. Los comprobantes imitan a los de un sistema de
  facturación, pero cada emisor arma su PDF a su manera: conviene repetir la medición con comprobantes reales
  del piloto, sin guardarlos, antes de confiar en la recuperación.
- El Word y el Excel se generaron sin Office: tienen la estructura de los reales, no todas sus variantes.
- El contrato largo repite siete cláusulas, así que la base lo comprime mucho más que a uno real: para estimar
  el espacio, conviene suponer de 2 a 3 veces lo medido en el texto guardado.
- Los tiempos de Render son una estimación (por 10), no una medición.
- Los picos de memoria son de un proceso que solo lee; en la API se suman al resto de su trabajo.
