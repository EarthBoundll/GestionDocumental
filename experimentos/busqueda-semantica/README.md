# Prueba aislada: búsqueda semántica

La prueba de concepto de [12 · Búsqueda e IA §4](../../docs/12-busqueda-e-ia.md) (D43): ¿la búsqueda con IA
encuentra lo que la actual no encuentra, y cabe en Render gratuito? **No forma parte del sistema.** Ni Render, ni
Vercel, ni la integración continua instalan esta carpeta, y no toca producción ni ninguna base real.

## Qué compara

Las mismas 43 búsquedas (`busquedas.ts`) sobre los mismos 52 documentos ficticios (`corpus.ts`):

| Buscador | Qué es |
|---|---|
| A | La búsqueda de producción (D42), con su código, sus migraciones y su RLS, en un PostgreSQL desechable |
| C | La misma, con el texto de cada archivo en la descripción: así se vería la búsqueda en el contenido |
| B | Semántica: `multilingual-e5-small` en este proceso, sobre el nombre, la categoría y la descripción |
| B+ | Semántica, además sobre el texto del archivo |
| A→B | Lo de A y, solo si A no encuentra nada, lo de B |

Escribe su informe en [`docs/evidencias/busqueda-semantica.md`](../../docs/evidencias/busqueda-semantica.md):
aciertos en el primero y en los cinco primeros, por grupo de búsqueda; qué devuelve cada uno cuando no hay
respuesta correcta; la memoria y el tiempo de CPU del modelo, con una estimación para la 0,1 CPU de Render.

## Ejecutarla

Requisitos:

- Node 24.
- Un usuario que no sea `root`: PostgreSQL no arranca como administrador.
- `npm ci` en `backend/`: la prueba usa su código y su PostgreSQL desechable.
- Acceso a `huggingface.co` la primera vez, para descargar el modelo.

```bash
cd experimentos/busqueda-semantica
npm ci
npm run medir              # todo, y escribe el informe
npm run medir -- --sin-ia  # solo A y C, en la consola, sin escribir el informe
```

## Qué descarga y por qué

| Qué | Por qué |
|---|---|
| `@huggingface/transformers` (Apache-2.0) | Ejecuta el modelo con onnxruntime dentro de Node. Con sus dependencias ocupa unos 550 MB: por eso vive aquí y no en `backend/` |
| `multilingual-e5-small`, cuantizado a 8 bits (licencia MIT) | Un modelo pequeño que entiende español. Se guarda en `.modelos/`, que git ignora |
| `supertest` | Llamar a la API de la prueba sin abrir un puerto, como las pruebas del backend |

El `.npmrc` evita que onnxruntime descargue sus binarios de GPU, que aquí no hacen falta: los de CPU ya vienen en
el paquete.

## Ampliar las búsquedas

Cada búsqueda de `busquedas.ts` lleva sus documentos correctos, por su clave en `corpus.ts`. Las escribió quien
conoce los documentos. Conviene sumar búsquedas de otras personas, por ejemplo de la capacitación, sin mirar los
nombres. Después se vuelve a medir.
