import { empresaDe, type Actor } from '../../compartido/peticion.js';
import { z } from '../../compartido/validacion.js';
import type { Consultor } from '../../db/pool.js';
import { asientosRecientes } from '../historial/historial.consulta.js';

const fecha = z.iso.date('Usa el formato AAAA-MM-DD');
const DIA_MS = 86_400_000;
/** Las acciones que caben de un vistazo en la tarjeta de actividad reciente; el resto está en el Historial. */
const ACTIVIDAD_RECIENTE = 8;
/** Un año como mucho: el tablero se lee de un vistazo, y la serie diaria tiene un punto por día. */
const MAXIMO_DE_DIAS = 366;

const hoyEnLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
const restarDias = (dia: string, dias: number) => new Date(Date.parse(dia) - dias * DIA_MS).toISOString().slice(0, 10);

/** El periodo, en días de Lima. Sin fechas, los últimos 30 días hasta hoy. */
export const esquemaPeriodo = z
  .object({ desde: fecha.optional(), hasta: fecha.optional() })
  .transform(({ desde, hasta }) => {
    const fin = hasta ?? hoyEnLima();
    return { desde: desde ?? restarDias(fin, 29), hasta: fin };
  })
  .refine(({ desde, hasta }) => desde <= hasta, { path: ['hasta'], message: 'Debe ser igual o posterior a la fecha «desde»' })
  .refine(({ desde, hasta }) => (Date.parse(hasta) - Date.parse(desde)) / DIA_MS < MAXIMO_DE_DIAS, {
    path: ['desde'],
    message: `Elige un periodo de ${MAXIMO_DE_DIAS} días como mucho`,
  });

export type Periodo = z.infer<typeof esquemaPeriodo>;

/** El periodo como instantes: de las 00:00 de «desde» a las 24:00 de «hasta», en Lima (M10). */
const EN_PERIODO = (columna: string) =>
  `${columna} >= ($2::date)::timestamp AT TIME ZONE 'America/Lima' AND ${columna} < ($3::date + 1)::timestamp AT TIME ZONE 'America/Lima'`;

async function resumen(db: Consultor, empresaId: string) {
  const { rows: [fila] } = await db.query<{
    documentos: number; enPapelera: number; almacenamientoBytes: number; usuarios: number; usuariosActivos: number;
    categoriasActivas: number; solicitudesPendientes: number;
  }>(
    `SELECT
       (SELECT count(*) FROM documentos WHERE empresa_id = $1 AND eliminado_en IS NULL)::int AS documentos,
       (SELECT count(*) FROM documentos WHERE empresa_id = $1 AND eliminado_en IS NOT NULL AND purgado_en IS NULL)::int AS "enPapelera",
       -- Todas las versiones (D30): es lo que ocupa de verdad. Lo purgado ya no está en el almacenamiento.
       (SELECT coalesce(sum(v.archivo_peso_bytes), 0) FROM documento_versiones v JOIN documentos d ON d.id = v.documento_id
         WHERE v.empresa_id = $1 AND d.purgado_en IS NULL)::float8 AS "almacenamientoBytes",
       (SELECT count(*) FROM usuarios WHERE empresa_id = $1)::int AS usuarios,
       (SELECT count(*) FROM usuarios WHERE empresa_id = $1 AND activo)::int AS "usuariosActivos",
       (SELECT count(*) FROM categorias WHERE empresa_id = $1 AND activa)::int AS "categoriasActivas",
       (SELECT count(*) FROM solicitudes WHERE empresa_id = $1 AND estado = 'pendiente')::int AS "solicitudesPendientes"`,
    [empresaId],
  );
  return fila!;
}

async function accionesDelPeriodo(db: Consultor, empresaId: string, { desde, hasta }: Periodo) {
  const { rows } = await db.query<{ accion: string; total: number; desdeMovil: number }>(
    `SELECT accion, count(*)::int AS total, count(*) FILTER (WHERE es_movil)::int AS "desdeMovil"
     FROM historial WHERE empresa_id = $1 AND ${EN_PERIODO('creado_en')} GROUP BY accion`,
    [empresaId, desde, hasta],
  );
  const de = (accion: string) => rows.find((fila) => fila.accion === accion) ?? { total: 0, desdeMovil: 0 };
  return { de, total: rows.reduce((suma, fila) => suma + fila.total, 0) };
}

async function recuperacion(db: Consultor, empresaId: string, { desde, hasta }: Periodo) {
  const { rows: [fila] } = await db.query<{ documentosObtenidos: number; busquedas: number; busquedasConResultado: number }>(
    `SELECT
       count(DISTINCT entidad_id) FILTER (WHERE accion IN ('DOCUMENTO_VISUALIZADO', 'DOCUMENTO_DESCARGADO'))::int AS "documentosObtenidos",
       count(*) FILTER (WHERE accion = 'BUSQUEDA_REALIZADA')::int AS busquedas,
       count(*) FILTER (WHERE accion = 'BUSQUEDA_REALIZADA' AND (detalle ->> 'resultados')::int > 0)::int AS "busquedasConResultado"
     FROM historial WHERE empresa_id = $1 AND ${EN_PERIODO('creado_en')}`,
    [empresaId, desde, hasta],
  );
  return fila!;
}

async function denegadosPorPermiso(db: Consultor, empresaId: string, { desde, hasta }: Periodo) {
  const { rows } = await db.query<{ permiso: string; total: number }>(
    `SELECT detalle ->> 'permiso' AS permiso, count(*)::int AS total
     FROM historial WHERE empresa_id = $1 AND accion = 'ACCESO_DENEGADO' AND ${EN_PERIODO('creado_en')}
     GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5`,
    [empresaId, desde, hasta],
  );
  return rows;
}

async function tiemposDeRespuesta(db: Consultor, empresaId: string, { desde, hasta }: Periodo) {
  const { rows: [fila] } = await db.query<{
    mediciones: number; servidorMediana: number | null; servidorP95: number | null; navegadorMediana: number | null; navegadorP95: number | null;
  }>(
    `SELECT count(*)::int AS mediciones,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duracion_servidor_ms))::int AS "servidorMediana",
            round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duracion_servidor_ms))::int AS "servidorP95",
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duracion_cliente_ms))::int AS "navegadorMediana",
            round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duracion_cliente_ms))::int AS "navegadorP95"
     FROM tiempos_respuesta WHERE empresa_id = $1 AND ${EN_PERIODO('creado_en')}`,
    [empresaId, desde, hasta],
  );
  return fila!;
}

async function actividadDiaria(db: Consultor, empresaId: string, { desde, hasta }: Periodo) {
  const { rows } = await db.query<{ dia: string; acciones: number }>(
    `SELECT to_char(d, 'YYYY-MM-DD') AS dia, coalesce(h.total, 0)::int AS acciones
     FROM generate_series($2::date, $3::date, interval '1 day') AS d
     LEFT JOIN (
       SELECT (creado_en AT TIME ZONE 'America/Lima')::date AS dia, count(*) AS total
       FROM historial WHERE empresa_id = $1 AND ${EN_PERIODO('creado_en')} GROUP BY 1
     ) h ON h.dia = d::date
     ORDER BY d`,
    [empresaId, desde, hasta],
  );
  return rows;
}

/** Un cociente como porcentaje con un decimal; sin denominador no hay porcentaje. */
const porcentaje = (parte: number, todo: number) => (todo === 0 ? null : Math.round((parte / todo) * 1000) / 10);

export type ServicioTablero = ReturnType<typeof crearServicioTablero>;

/**
 * El tablero del administrador (RF28): el estado de su empresa y lo que el sistema registra de cada
 * indicador de la tesis (docs/01-analisis.md §8) en un periodo. Lo que el sistema no puede saber —el
 * denominador de los indicadores 3, 4 y 6, o cuándo empezó una tarea cronometrada— lo pone el
 * protocolo de prueba; aquí no se inventa.
 */
export function crearServicioTablero() {
  return {
    async obtener(actor: Actor, periodo: Periodo) {
      const empresaId = empresaDe(actor);
      return actor.datos.ejecutar(async (db) => {
        // Una tras otra: comparten la conexión de la transacción, que atiende una consulta a la vez.
        const estado = await resumen(db, empresaId);
        const acciones = await accionesDelPeriodo(db, empresaId, periodo);
        const obtenidos = await recuperacion(db, empresaId, periodo);
        const denegados = await denegadosPorPermiso(db, empresaId, periodo);
        const tiempos = await tiemposDeRespuesta(db, empresaId, periodo);
        const actividad = await actividadDiaria(db, empresaId, periodo);
        const recientes = await asientosRecientes(db, empresaId, ACTIVIDAD_RECIENTE);
        const sesiones = acciones.de('SESION_INICIADA');
        const fallidas = acciones.de('SESION_FALLIDA');
        return {
          periodo,
          resumen: estado,
          indicadores: {
            organizacion: { subidos: acciones.de('DOCUMENTO_SUBIDO').total, editados: acciones.de('DOCUMENTO_EDITADO').total },
            busqueda: { busquedas: obtenidos.busquedas, listados: tiempos.mediciones },
            recuperacion: {
              documentosObtenidos: obtenidos.documentosObtenidos,
              visualizaciones: acciones.de('DOCUMENTO_VISUALIZADO').total,
              descargas: acciones.de('DOCUMENTO_DESCARGADO').total,
              busquedasConResultado: obtenidos.busquedasConResultado,
              porcentajeBusquedasConResultado: porcentaje(obtenidos.busquedasConResultado, obtenidos.busquedas),
            },
            historial: { acciones: acciones.total },
            accesoRemoto: {
              sesionesDesdeMovil: sesiones.desdeMovil,
              intentosDesdeMovil: sesiones.desdeMovil + fallidas.desdeMovil,
              porcentajeExitoMovil: porcentaje(sesiones.desdeMovil, sesiones.desdeMovil + fallidas.desdeMovil),
              sesiones: sesiones.total,
            },
            accesosPorRol: { denegados: acciones.de('ACCESO_DENEGADO').total, porPermiso: denegados },
            tiempoRespuesta: tiempos,
          },
          // El flujo de aprobación (RF16) en el periodo: que la revisión filtra de verdad se ve en los rechazos.
          aprobacion: {
            solicitadas: acciones.de('SOLICITUD_CREADA').total,
            aprobadas: acciones.de('SOLICITUD_APROBADA').total,
            rechazadas: acciones.de('SOLICITUD_RECHAZADA').total,
          },
          actividad,
          recientes,
        };
      });
    },
  };
}
