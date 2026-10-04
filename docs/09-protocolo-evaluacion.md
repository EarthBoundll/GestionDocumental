# 09 · Protocolo de evaluación

Borrador para revisar con el asesor. Fija qué se pide a cada participante en la preprueba y en la
posprueba, cuándo empieza y termina cada medición y qué se anota. El sistema mide lo suyo
([08 · Indicadores](08-indicadores.md)); este protocolo fija el resto. Lo que falta decidir va marcado
**[Por definir]**.

## 1. Diseño

Preexperimental, con preprueba y posprueba en un solo grupo: G · O1 → X → O2.

| | Qué es | Con qué se hace |
|---|---|---|
| O1 · Preprueba | Los siete indicadores, medidos en el proceso actual de la empresa | Lo que la empresa usa hoy: archivadores, carpetas de la PC, correo, WhatsApp. **Sin el sistema** |
| X · Tratamiento | La empresa adopta el sistema: alta, carga del lote base y capacitación | La versión congelada |
| O2 · Posprueba | Los mismos indicadores, con las mismas tareas, en el sistema | La versión congelada, en `gestion.formatosperu.com` |

Como la preprueba no usa el sistema, puede hacerse en cuanto estén firmados los consentimientos, aunque
el sistema siga en desarrollo. Lo que no se mueve es el **congelamiento**: desde la capacitación hasta
terminar la posprueba el sistema no cambia, para que todos los participantes midan lo mismo. Se marca
con una etiqueta de versión en git y un respaldo restaurado en una base vacía.

## 2. Empresa y participantes

| Dato | Valor |
|---|---|
| Empresas | **[Por definir]**. Supuesto: una MYPE, el taller textil del caso de validación |
| Participantes | **[Por definir]**. Supuesto: hasta 10, todas las personas que manejan documentos en la empresa (muestra censal) |
| Inclusión | Maneja documentos de la empresa al menos una vez por semana y firmó el consentimiento |
| Exclusión | Participó en el piloto o colaboró en el diseño del sistema |
| Rol en el sistema | El dueño o encargado, Administrador de Empresa; el resto, Usuario |
| Identificación | Un código por persona (P01, P02…). La tabla que une código y nombre la guarda el investigador fuera del repositorio y fuera de la tesis |

El aislamiento entre empresas (indicador 6) se prueba contra una **empresa de control**: una segunda
empresa que el Master da de alta con datos ficticios y que solo usa el investigador.

## 3. Materiales

Se preparan en la sesión de diagnóstico (§5), con el dueño o encargado.

| Material | Qué es | Para |
|---|---|---|
| Ficha de diagnóstico | Dónde están hoy los documentos, cómo se clasifican, quién puede ver qué y qué constancia queda de cada movimiento | Que la preprueba reproduzca el proceso real y que los casos de rol tengan un resultado esperado |
| Lote base | 40 documentos representativos (comprobantes, contratos, cotizaciones, documentos del personal) repartidos entre las categorías que la empresa ya usa | Indicadores 2, 3 y 7. En la preprueba se buscan donde la empresa los guarda; antes de la posprueba se cargan en el sistema sus copias no sensibles |
| Lote de organización | 10 documentos que aún no están archivados, en el formato en que llegan hoy (papel o archivo) | Indicador 1 |
| Listas A y B | Dos listas de 5 documentos del lote base, sorteadas con la misma mezcla de categorías y antigüedad. A en la preprueba, B en la posprueba | Indicadores 2 y 3, sin que nadie busque en la posprueba lo que ya encontró en la preprueba |
| Guion de acciones | §6.3 | Indicador 4 |
| Casos de rol | §6.5 | Indicador 6 |
| Ficha de observación | §8, una por participante y por sesión | Todo lo que mide el evaluador |

**Documentos no sensibles.** Lo que entra al sistema son copias sin datos personales de terceros ni
información confidencial: nombres, DNI, montos y cuentas tachados o reemplazados. En la tesis, los lotes y
las listas se describen por su tipo y su categoría, nunca por su contenido.

## 4. Condiciones

- **Preprueba:** el puesto de trabajo habitual, con lo que la persona usa cada día.
- **Posprueba:** la PC habitual de la empresa y el celular de la persona. En la ficha se anotan el
  dispositivo, el navegador y la conexión (Wi-Fi de la empresa o datos móviles).
- **Evaluador:** el mismo en todas las sesiones. Lee las consignas tal como están escritas, no ayuda
  durante una tarea y cronometra con el celular.
- **Antes de cada sesión de posprueba,** lo de [07 · Despliegue §9](07-despliegue.md): proyecto activo
  en Supabase y `/api/v1/salud` abierto dos minutos antes.
- Pre y posprueba a la misma hora del día, en el mismo lugar.

## 5. Sesiones

| Sesión | Con quién | Duración | Qué |
|---|---|---|---|
| 0 · Diagnóstico | Dueño o encargado | 60 min | Ficha de diagnóstico, lotes, sorteo de las listas A y B, casos de rol adaptados a la empresa |
| Piloto | Una persona fuera de la muestra | 90 min | El protocolo completo, para medir duraciones y corregir consignas ambiguas. Los cambios se anotan en §11 |
| 1 · Preprueba | Cada participante | 45–60 min | Las tareas de §6, en el proceso actual |
| Preparación | Investigador | — | Empresa de validación y de control en el sistema, categorías, cuentas, carga del lote base. Congelamiento |
| 2 · Capacitación | Todos | 30–45 min | Iniciar sesión en la PC y en el celular, subir, buscar, ver, descargar, pedir aprobación; el administrador, además, aprobar, restaurar y restringir una categoría. Con documentos que no están en la lista B |
| Periodo de uso | Todos | **[Por definir]** | Si el asesor lo pide, unos días de uso real antes de medir. Suma tiempo de calendario, no de trabajo |
| 3 · Posprueba | Cada participante | 45–60 min | Las mismas tareas de §6, en el sistema |
| Cierre | Investigador | 30 min por sesión | Exportar el historial a CSV y ejecutar las consultas de [08 · Indicadores](08-indicadores.md) con la ventana de la sesión; guardar ambos fuera de Supabase |

## 6. Tareas

Mismo orden en las dos pruebas. Las consignas entre comillas se leen tal cual.

### 6.1 Indicador 1 · Tiempo de organización y categorización

«Aquí tiene 10 documentos nuevos. Archívelos como lo haría normalmente, cada uno en la categoría que le
corresponde. Avíseme cuando termine.»

| | Preprueba | Posprueba |
|---|---|---|
| Qué hace | Archiva los 10 en el archivador o en las carpetas de la PC | Sube los 10 al sistema, cada uno con nombre y categoría |
| Empieza | Al terminar de leer la consigna | Igual |
| Termina | La persona dice «terminé» | Igual |
| Se anota | Segundos y documentos mal clasificados | Igual. El sistema lo corrobora con `DOCUMENTO_SUBIDO` ([08 §1](08-indicadores.md)) |

**Resultado:** segundos por documento (total ÷ 10). Un documento en la categoría equivocada se anota
aparte y no se corrige durante la tarea.

### 6.2 Indicadores 2 y 3 · Tiempo de búsqueda y tasa de recuperación

Por cada documento de la lista: «Necesito [descripción]. Búsquelo y muéstremelo.» La descripción es la
que daría un compañero («la cotización de la tela de agosto»), nunca el nombre exacto del archivo.

| | Preprueba | Posprueba |
|---|---|---|
| Lista | A | B |
| Empieza | Al terminar de leer la descripción | Igual, con la persona en la pantalla *Documentos* |
| Termina | Muestra el papel o abre el archivo correcto | Abre el documento correcto con *Ver* o lo descarga |
| Tope | 3 minutos por documento | Igual |
| Se anota | Segundos y si lo obtuvo | Igual. El sistema lo corrobora ([08 §2 y §3](08-indicadores.md)) |

- **Indicador 2:** segundos por documento. Uno que no se obtuvo dentro del tope cuenta 180 s, en las
  dos pruebas por igual.
- **Indicador 3:** documentos obtenidos ÷ 5. Si muestra uno equivocado, se le dice «no es ese» una sola
  vez y el cronómetro sigue.
- Antes de la posprueba, el investigador comprueba en el *Historial* que ningún documento de la lista B
  fue abierto por esa persona en la capacitación o en el periodo de uso.

### 6.3 Indicador 4 · Acciones registradas en el historial

La persona ejecuta el guion en orden. Una acción está **registrada** si queda constancia de quién la
hizo, qué hizo, sobre qué documento y cuándo, sin que nadie la anote después a propósito: el mismo
criterio que cumple el historial del sistema.

| # | Acción | En el sistema queda como | Quién |
|---|---|---|---|
| 1 | Registrar un documento nuevo | `DOCUMENTO_SUBIDO` | Participante |
| 2 | Corregir un dato de ese documento | `DOCUMENTO_EDITADO` | Participante |
| 3 | Buscar documentos de una categoría y un mes | `BUSQUEDA_REALIZADA` | Participante |
| 4 | Consultar un documento | `DOCUMENTO_VISUALIZADO` | Participante |
| 5 | Sacar una copia para entregarla | `DOCUMENTO_DESCARGADO` | Participante |
| 6 | Pedir el visto bueno del documento X | `SOLICITUD_CREADA` | Participante |
| 7 | Pedir el visto bueno del documento Y | `SOLICITUD_CREADA` | Participante |
| 8 | Desechar un documento propio que ya no sirve | `DOCUMENTO_ELIMINADO` | Participante |
| 9 | Dar el visto bueno a X | `SOLICITUD_APROBADA` | Administrador |
| 10 | Negar el visto bueno a Y | `SOLICITUD_RECHAZADA` | Administrador |
| 11 | Recuperar el documento desechado | `DOCUMENTO_RESTAURADO` | Administrador |

**Resultado:** acciones registradas ÷ acciones ejecutadas. El evaluador marca en la ficha cada acción
ejecutada. En la preprueba, al terminar, revisa qué constancia quedó de cada una (cuaderno de cargos,
registro de entradas y salidas, correo, mensaje). En la posprueba, la consulta de
[08 §4](08-indicadores.md) en la ventana de la sesión. Las acciones 9 a 11 las ejecuta el administrador de
la empresa sobre lo que hizo cada participante.

### 6.4 Indicador 5 · Accesibilidad remota

Tres intentos por participante, desde su celular, fuera del local y con datos móviles, en momentos
distintos (uno fuera del horario de trabajo). El evaluador escribe: «Necesito [documento del lote base].
Tienes 5 minutos.»

| | Preprueba | Posprueba |
|---|---|---|
| Éxito | La persona obtiene el documento por sí misma, sin pedírselo a alguien del local, en 5 minutos | La persona inicia sesión desde el celular y abre o descarga el documento en 5 minutos |
| Se anota | Fecha y hora, éxito y, si falló, por qué | Igual. El sistema corrobora el inicio de sesión desde el celular ([08 §5](08-indicadores.md)) y la obtención del documento |

**Resultado:** intentos exitosos ÷ intentos. Un intento que falla por falta de cobertura cuenta como
fallido: el sistema no puede verlo, así que lo anota el evaluador.

### 6.5 Indicador 6 · Accesos correctos según rol

La persona intenta cada caso y el evaluador anota lo que ocurrió. El resultado esperado se fija antes de
evaluar: en la posprueba sale de la matriz de [01 · Análisis §6](01-analisis.md); en la preprueba, de las
reglas que la propia empresa declaró en la ficha de diagnóstico.

| # | Caso | Esperado en el sistema | Para |
|---|---|---|---|
| 1 | Ver y descargar un documento de su empresa | Permitido | Todos |
| 2 | Editar un documento que subió otra persona | Denegado | Usuario |
| 3 | Editar un documento propio | Permitido | Todos |
| 4 | Ver los documentos de una categoría restringida a la que no tiene acceso | No los ve | Usuario |
| 5 | Entrar a la papelera | Denegado | Usuario |
| 6 | Entrar al historial de la empresa | Denegado | Usuario |
| 7 | Aprobar una solicitud | Denegado al usuario; permitido al administrador, salvo la suya | Todos |
| 8 | Abrir el enlace de un documento de la empresa de control | No existe | Todos, solo en la posprueba |

**Resultado:** casos correctos ÷ casos evaluados. Los casos 1 a 7 se comparan entre pre y posprueba. El
8 no tiene equivalente en el proceso actual (nadie guarda documentos de otra empresa): se informa solo en
la posprueba, junto con el [informe de aislamiento](evidencias/aislamiento-entre-empresas.md), que lo
prueba en todos los endpoints.

### 6.6 Indicador 7 · Tiempo de respuesta

«Muéstreme todos los documentos de [categoría] que tiene la empresa.»

| | Preprueba | Posprueba |
|---|---|---|
| Empieza | Al terminar de leer la consigna | Igual |
| Termina | La relación está a la vista: la carpeta abierta, el archivador o el cuaderno de registro | El listado filtrado está en pantalla |
| Se anota | Segundos | Segundos. Además, el sistema guarda el tiempo de carga de cada listado (`tiempos_respuesta`, [08 §7](08-indicadores.md)) |

**Resultado:** segundos, comparables entre las dos pruebas. La mediana y el percentil 95 del tiempo de
carga del sistema se informan aparte, frente a la meta de RNF05 (menos de 1 s). **[Por definir con el
asesor]:** si prefiere solo el tiempo técnico, el indicador 7 se informa únicamente en la posprueba.

## 7. Sesgos y cómo se controlan

| Riesgo | Control |
|---|---|
| Aprendizaje: buscar en la posprueba lo que ya se encontró en la preprueba | Listas A y B distintas, sorteadas con la misma mezcla |
| Atajos: buscar algo que ya se abrió antes | La lista B solo tiene documentos que la persona no abrió antes; se comprueba en el *Historial* (§6.2) |
| El evaluador influye en el resultado | Consignas leídas tal cual, ninguna ayuda durante la tarea, un solo evaluador |
| El sistema cambia entre participantes | Versión congelada desde la capacitación hasta terminar la posprueba |
| La primera petición tarda porque la API estaba dormida | `/api/v1/salud` dos minutos antes de cada sesión |
| Efecto de sentirse observado | Igual en las dos pruebas: el mismo evaluador, el mismo lugar y la misma hora |

## 8. Ficha de observación

Una por participante y por sesión. Cabecera: código, sesión (pre o pos), fecha y hora, dispositivo y
conexión, evaluador.

| Indicador | Tarea | Qué se anota |
|---|---|---|
| 1 | Organizar 10 documentos | Segundos · mal clasificados |
| 2 y 3 | Documentos 1 a 5 de la lista | Por cada uno: segundos · obtenido (sí o no) |
| 4 | Acciones 1 a 11 | Por cada una: ejecutada (sí o no) · registrada (sí o no) · dónde quedó la constancia |
| 5 | Intentos 1 a 3 | Por cada uno: fecha y hora · éxito (sí o no) · motivo si falló |
| 6 | Casos 1 a 8 | Por cada uno: resultado obtenido · correcto (sí o no) |
| 7 | Relación de una categoría | Segundos |
| — | Incidencias | Lo que interrumpió o cambió una tarea, y a qué hora |

## 9. Análisis

Por indicador, la diferencia entre preprueba y posprueba de cada participante. Con menos de 50 personas,
normalidad con Shapiro-Wilk; si las diferencias son normales, t de Student para muestras relacionadas, y
si no, Wilcoxon. Nivel de significancia: 0,05. Hipótesis nula de cada indicador: no hay diferencia entre
la preprueba y la posprueba.

## 10. Ética y datos personales

- **Consentimiento** firmado antes de la preprueba ([10 · Consentimiento](10-consentimiento-informado.md)),
  y la autorización escrita de la empresa para usar sus procesos y copias de sus documentos.
- **Datos mínimos en el sistema:** el nombre de cada participante es su código (P01…); el correo, el que
  la persona elija, incluso uno creado para la evaluación; el DNI no se registra.
- **Dónde quedan:** la base y los archivos en Supabase y la API en Render, ambos en Virginia (EE. UU.); el
  correo de recuperación sale por Brevo. Es una transferencia internacional de datos según la Ley 29733 y
  su reglamento (D. S. 016-2024-JUS), y el consentimiento la nombra.
- **Retiro:** quien se retira deja de participar en ese momento; su cuenta se desactiva y sus datos se
  excluyen del análisis. El historial ya registrado no se puede modificar desde el sistema, porque eso
  es justo lo que garantiza la trazabilidad (RN17).
- **Cierre del estudio:** **[Por definir con el asesor]** la fecha. Ese día el investigador elimina de la
  base los datos de la empresa evaluada. Como el historial es inmutable para la aplicación, hace falta un
  procedimiento manual del dueño de la base, que se escribirá y probará antes de la preprueba.

## 11. Registro de cambios del protocolo

| Fecha | Cambio | Por qué |
|---|---|---|
| — | Borrador inicial | — |
