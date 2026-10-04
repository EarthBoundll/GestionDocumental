import { Router, type RequestHandler } from 'express';
import { aCsv } from '../../compartido/csv.js';
import { desplazamiento, esquemaPaginacion } from '../../compartido/paginacion.js';
import { actorDe, empresaDe, type Actor } from '../../compartido/peticion.js';
import type { Permiso } from '../../compartido/permisos.js';
import { sinVacios, z } from '../../compartido/validacion.js';
import type { Consultor } from '../../db/pool.js';
import { ACCIONES, autorDe, registrarAccion } from './historial.registro.js';

const fecha = z.iso.date('Usa el formato AAAA-MM-DD');

const esquemaFiltros = z
  .object({
    usuarioId: sinVacios(z.uuid().optional()),
    accion: sinVacios(z.enum(ACCIONES).optional()),
    entidadTipo: sinVacios(z.enum(['empresa', 'usuario', 'sesion', 'categoria', 'documento', 'solicitud']).optional()),
    entidadId: sinVacios(z.uuid().optional()),
    /** Solo en el historial de la plataforma: en el de una empresa, la empresa es siempre la del actor. */
    empresaId: sinVacios(z.uuid().optional()),
    desde: sinVacios(fecha.optional()),
    hasta: sinVacios(fecha.optional()),
  })
  .refine((filtros) => !filtros.desde || !filtros.hasta || filtros.desde <= filtros.hasta, {
    path: ['hasta'],
    message: 'Debe ser igual o posterior a la fecha «desde»',
  });

type Filtros = z.infer<typeof esquemaFiltros>;

/** Una exportación nunca debería acercarse a esto en la tesis; el tope evita agotar la memoria de Render. */
const MAXIMO_EXPORTABLE = 50_000;

/**
 * De qué historial se trata. El de una empresa se filtra por su empresa; el de la plataforma (RF27) es
 * la excepción del Master, escrita aquí igual que en su política RLS (006): sus propias acciones y lo
 * que no pertenece a ninguna empresa, nunca la actividad de las personas de una empresa.
 */
type Ambito = { empresaId: string } | 'plataforma';

/**
 * Las fechas del filtro son días de Lima: «hasta el 2 de octubre» incluye ese día entero en Lima,
 * aunque en UTC ya sea el 3 (M10).
 */
function condiciones(ambito: Ambito, filtros: Filtros) {
  const lista: string[] = [];
  const parametros: unknown[] = [];
  const agregar = (condicion: (parametro: string) => string, valor: unknown) => {
    parametros.push(valor);
    lista.push(condicion(`$${parametros.length}`));
  };
  if (ambito === 'plataforma') {
    lista.push("(h.empresa_id IS NULL OR h.rol_usuario = 'master')");
    if (filtros.empresaId) agregar((p) => `h.empresa_id = ${p}`, filtros.empresaId);
  } else {
    agregar((p) => `h.empresa_id = ${p}`, ambito.empresaId);
  }
  if (filtros.usuarioId) agregar((p) => `h.usuario_id = ${p}`, filtros.usuarioId);
  if (filtros.accion) agregar((p) => `h.accion = ${p}`, filtros.accion);
  if (filtros.entidadTipo) agregar((p) => `h.entidad_tipo = ${p}`, filtros.entidadTipo);
  if (filtros.entidadId) agregar((p) => `h.entidad_id = ${p}`, filtros.entidadId);
  if (filtros.desde) agregar((p) => `h.creado_en >= (${p}::date)::timestamp AT TIME ZONE 'America/Lima'`, filtros.desde);
  if (filtros.hasta) agregar((p) => `h.creado_en < (${p}::date + 1)::timestamp AT TIME ZONE 'America/Lima'`, filtros.hasta);
  return { where: lista.join(' AND '), parametros };
}

interface Asiento {
  id: string;
  accion: string;
  /** La empresa del asiento; null en lo que no pertenece a ninguna (el Master en su cuenta). */
  empresa: { id: string; nombre: string } | null;
  usuario: { id: string; nombre: string; email: string } | null;
  rolUsuario: string | null;
  entidad: { tipo: string; id: string } | null;
  detalle: Record<string, unknown>;
  userAgent: string | null;
  esMovil: boolean | null;
  creadoEn: Date;
}

interface FilaAsiento {
  id: string;
  accion: string;
  empresa_id: string | null;
  empresa_nombre: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
  rol_usuario: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  detalle: Record<string, unknown>;
  user_agent: string | null;
  es_movil: boolean | null;
  creado_en: Date;
  creado_en_lima: string;
}

const SELECCION = `
  SELECT h.id::text AS id, h.accion, h.empresa_id, e.nombre AS empresa_nombre, h.usuario_id, u.nombre AS usuario_nombre, u.email AS usuario_email, h.rol_usuario,
         h.entidad_tipo, h.entidad_id, h.detalle, h.user_agent, h.es_movil, h.creado_en,
         to_char(h.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI:SS') AS creado_en_lima
  FROM historial h LEFT JOIN usuarios u ON u.id = h.usuario_id LEFT JOIN empresas e ON e.id = h.empresa_id`;

async function consultar(db: Consultor, ambito: Ambito, filtros: Filtros, limite: number, desde = 0): Promise<FilaAsiento[]> {
  const { where, parametros } = condiciones(ambito, filtros);
  const { rows } = await db.query<FilaAsiento>(
    `${SELECCION} WHERE ${where} ORDER BY h.id DESC LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
    [...parametros, limite, desde],
  );
  return rows;
}

/**
 * El Master no pertenece a la empresa, así que su cuenta no se ve desde ella (RLS): su asiento sale sin
 * usuario y con el rol «master», y se muestra como «Administración de la plataforma».
 */
const AUTOR_DE_LA_PLATAFORMA = 'Administración de la plataforma';

function aAsiento(fila: FilaAsiento): Asiento {
  return {
    id: fila.id,
    accion: fila.accion,
    empresa: fila.empresa_id && fila.empresa_nombre !== null ? { id: fila.empresa_id, nombre: fila.empresa_nombre } : null,
    usuario: fila.usuario_id && fila.usuario_nombre !== null
      ? { id: fila.usuario_id, nombre: fila.usuario_nombre, email: fila.usuario_email! }
      : null,
    rolUsuario: fila.rol_usuario,
    entidad: fila.entidad_tipo ? { tipo: fila.entidad_tipo, id: fila.entidad_id! } : null,
    detalle: fila.detalle,
    userAgent: fila.user_agent,
    esMovil: fila.es_movil,
    creadoEn: fila.creado_en,
  };
}

async function listarEn(actor: Actor, ambito: Ambito, filtros: Filtros, paginacion: z.infer<typeof esquemaPaginacion>) {
  const { where, parametros } = condiciones(ambito, filtros);
  const { conteo, filas } = await actor.datos.ejecutar(async (db) => ({
    conteo: (await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM historial h WHERE ${where}`, parametros)).rows[0],
    filas: await consultar(db, ambito, filtros, paginacion.porPagina, desplazamiento(paginacion)),
  }));
  return { datos: filas.map(aAsiento), paginacion: { ...paginacion, total: conteo?.total ?? 0 } };
}

/** Lo último que pasó en una empresa, para el tablero (RF28): el «centro de actividad» sin un módulo aparte. */
export async function asientosRecientes(db: Consultor, empresaId: string, limite: number): Promise<Asiento[]> {
  return (await consultar(db, { empresaId }, {}, limite)).map(aAsiento);
}

/** El ciclo de vida de un documento: lo que lo cambia y lo que pasa con sus solicitudes de aprobación. */
const CICLO_DE_VIDA = [
  'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_RESTAURADO',
  'SOLICITUD_CREADA', 'SOLICITUD_APROBADA', 'SOLICITUD_RECHAZADA',
] as const;

/**
 * Lo que además ve quien puede consultar el historial: quién lo vio, quién lo descargó y quién intentó lo
 * que no podía. A un usuario no se le muestra, para que la ficha no sea una vigilancia entre compañeros.
 */
const CONSULTAS = ['DOCUMENTO_VISUALIZADO', 'DOCUMENTO_DESCARGADO', 'ACCESO_DENEGADO'] as const;

export interface ActividadDeDocumento {
  id: string;
  accion: string;
  usuario: { id: string; nombre: string } | null;
  rolUsuario: string | null;
  detalle: Record<string, unknown>;
  esMovil: boolean | null;
  creadoEn: Date;
}

/**
 * La línea de tiempo de un documento: sus asientos y los de sus solicitudes, lo más reciente primero. Quien
 * llama ya comprobó que el documento existe y que el actor lo ve (RLS y categorías restringidas).
 */
export async function actividadDeDocumento(
  db: Consultor,
  empresaId: string,
  documentoId: string,
  { conConsultas, paginacion }: { conConsultas: boolean; paginacion: z.infer<typeof esquemaPaginacion> },
): Promise<{ filas: ActividadDeDocumento[]; total: number }> {
  const acciones = conConsultas ? [...CICLO_DE_VIDA, ...CONSULTAS] : [...CICLO_DE_VIDA];
  const where = `h.empresa_id = $1 AND h.accion = ANY ($3::text[]) AND (
      (h.entidad_tipo = 'documento' AND h.entidad_id = $2)
      OR (h.entidad_tipo = 'solicitud' AND h.entidad_id IN (
        SELECT s.id FROM solicitudes s WHERE s.empresa_id = $1 AND s.documento_id = $2)))`;
  const parametros = [empresaId, documentoId, acciones];
  const { rows: [conteo] } = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM historial h WHERE ${where}`, parametros);
  const { rows } = await db.query<FilaAsiento>(
    `${SELECCION} WHERE ${where} ORDER BY h.id DESC LIMIT $4 OFFSET $5`,
    [...parametros, paginacion.porPagina, desplazamiento(paginacion)],
  );
  return {
    total: conteo?.total ?? 0,
    filas: rows.map((fila) => ({
      id: fila.id,
      accion: fila.accion,
      usuario: fila.usuario_id && fila.usuario_nombre !== null ? { id: fila.usuario_id, nombre: fila.usuario_nombre } : null,
      rolUsuario: fila.rol_usuario,
      detalle: fila.detalle,
      esMovil: fila.es_movil,
      creadoEn: fila.creado_en,
    })),
  };
}

export function crearServicioHistorial() {
  return {
    listar: (actor: Actor, filtros: Filtros, paginacion: z.infer<typeof esquemaPaginacion>) =>
      listarEn(actor, { empresaId: empresaDe(actor) }, filtros, paginacion),

    /** RF27: la auditoría de la plataforma, para el Master. Su acceso (app_plataforma) no ve nada más. */
    listarDePlataforma: (actor: Actor, filtros: Filtros, paginacion: z.infer<typeof esquemaPaginacion>) =>
      listarEn(actor, 'plataforma', filtros, paginacion),

    /**
     * RF20: el historial en CSV, la evidencia del capítulo 3 (R3). Exportarlo también es una acción
     * auditable: la lectura y su registro van en una transacción, y si no se puede registrar no se entrega.
     */
    async exportar(actor: Actor, filtros: Filtros): Promise<string> {
      const { usuario } = actor.autenticacion;
      const filas = await actor.datos.ejecutar(async (cliente) => {
        const filas = await consultar(cliente, { empresaId: empresaDe(actor) }, filtros, MAXIMO_EXPORTABLE);
        await registrarAccion(cliente, {
          accion: 'HISTORIAL_EXPORTADO',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          detalle: { filtros, filas: filas.length },
        });
        return filas;
      });
      return aCsv(
        ['id', 'fecha_hora_lima', 'fecha_hora_utc', 'accion', 'usuario', 'email', 'rol', 'entidad_tipo', 'entidad_id', 'es_movil', 'user_agent', 'detalle'],
        filas.map((fila) => [
          fila.id, fila.creado_en_lima, fila.creado_en.toISOString(), fila.accion,
          fila.rol_usuario === 'master' ? AUTOR_DE_LA_PLATAFORMA : fila.usuario_nombre, fila.usuario_email,
          fila.rol_usuario, fila.entidad_tipo, fila.entidad_id, fila.es_movil, fila.user_agent, fila.detalle,
        ]),
      );
    },
  };
}

/** Las rutas del historial de la plataforma: entran por la puerta del Master. */
export function crearRutasAuditoria(servicio: ReturnType<typeof crearServicioHistorial>): Router {
  const rutas = Router();
  rutas.get('/', async (req, res) => {
    const filtros = esquemaFiltros.parse(req.query);
    const paginacion = esquemaPaginacion.parse(req.query);
    res.json(await servicio.listarDePlataforma(actorDe(req), filtros, paginacion));
  });
  return rutas;
}

export function crearRutasHistorial(
  servicio: ReturnType<typeof crearServicioHistorial>,
  /** La puerta de empresa: sesión válida y un rol que pertenece a una empresa. */
  entrar: RequestHandler,
  exigir: (permiso: Permiso) => RequestHandler,
): Router {
  const rutas = Router();
  rutas.use(entrar, exigir('CONSULTAR_HISTORIAL'));

  rutas.get('/', async (req, res) => {
    const filtros = esquemaFiltros.parse(req.query);
    const paginacion = esquemaPaginacion.parse(req.query);
    res.json(await servicio.listar(actorDe(req), filtros, paginacion));
  });

  rutas.get('/exportar', async (req, res) => {
    const filtros = esquemaFiltros.parse(req.query);
    const csv = await servicio.exportar(actorDe(req), filtros);
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="historial-${hoy}.csv"`,
    });
    res.send(csv);
  });

  return rutas;
}
