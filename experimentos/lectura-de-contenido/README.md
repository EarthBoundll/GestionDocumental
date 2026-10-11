# Prueba aislada: leer el contenido de los documentos

El paso 1 de la búsqueda en el contenido: ¿puede la API leer el texto de los PDF, Word y Excel que se suben, y
sacar sus palabras clave, sin IA, sin OCR, sin mandar nada a terceros y dentro de Render gratuito? **No forma
parte del sistema.** Ni Render, ni Vercel, ni la integración continua instalan esta carpeta, y no toca
producción ni ninguna base real.

| Archivo | Qué es |
|---|---|
| `leer.ts` | El lector candidato: PDF con unpdf (pdf.js de Mozilla), Word y Excel con `zip.ts`. Nunca lanza un error |
| `zip.ts` | Lo justo de ZIP, sin librería, con un tope de lo que se descomprime (frena una bomba de compresión) |
| `palabras-clave.ts` | RUC, comprobantes, montos y fechas por su forma, y las palabras más repetidas (TF o TF-IDF) |
| `archivos.ts` | 56 archivos ficticios: los 40 del piloto, comprobantes electrónicos, un contrato largo, un escaneo, un Word, un Excel y casos hostiles |
| `medir.ts`, `medir-uno.ts` | La medición y su informe |

El informe queda en [`docs/evidencias/lectura-de-contenido.md`](../../docs/evidencias/lectura-de-contenido.md): qué
responde el lector con cada archivo, cuánto del texto recupera, su CPU (con una estimación para la 0,1 CPU de
Render), su memoria, cuánto ocuparía en la base y qué palabras clave saca.

## Ejecutarla

Requisitos: Node 24, `npm ci` en `backend/` (usa su generador de documentos de prueba y su PostgreSQL
desechable) y un usuario que no sea `root` para medir el espacio en la base.

```bash
cd experimentos/lectura-de-contenido
npm ci
npm run medir                 # todo, y escribe el informe
npm run medir -- --sin-base   # sin PostgreSQL (por ejemplo, como root)
```

Los archivos generados quedan en `.archivos/`, que git ignora, para abrirlos a mano.

## Qué instala y por qué

| Qué | Por qué |
|---|---|
| `unpdf` (MIT, 2 MB, sin dependencias) | Lee el texto de un PDF con pdf.js 6, que no convierte fuentes en código. Es lo único que entraría a la API |
| `pdfkit` y `dejavu-fonts-ttf` (solo para la prueba) | Generar comprobantes como los de un sistema de facturación: comprimidos y con la fuente incrustada |
