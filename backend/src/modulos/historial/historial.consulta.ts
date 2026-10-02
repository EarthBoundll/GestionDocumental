import { Router, type RequestHandler } from 'express';
import type pg from 'pg';
import { aCsv } from '../../compartido/csv.js';
import { desplazamiento, esquemaPaginacion } from '../../compartido/paginacion.js';
import { actorDe, type Actor } from '../../compartido/peticion.js';
import type { Permiso } from '../../compartido/permisos.js';
import { sinVacios, z } from '../../compartido/validacion.js';
import type { Consultor } from '../../db/pool.js';
import { conTransaccion } from '../../db/transaccion.js';
import { ACCIONES, autorDe, registrarAccion } from './historial.registro.js';

const fecha = z.iso.date('Usa el formato AAAA-MM-DD');

const esquemaFiltros = z
  .object({
    usuarioId: sinVacios(z.uuid().optional()),
    accion: sinVacios(z.enum(ACCIONES).optional()),
    entidadTipo: sinVacios(z.enum(['organizacion', 'usuario', 'sesion', 'categoria', 'documento', 'solicitud']).optional()),
    entidadId: sinVacios(z.uuid().optional()),
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
 * Las fechas del filtro son días de Lima: «hasta el 2 de octubre» incluye ese día entero en Lima,
 * aunque en UTC ya sea el 3 (M10).
 */
function condiciones(organizacionId: string, filtros: Filtros) {
  const lista = ['h.organizacion_id = $1'];
  const parametros: unknown[] = [organizacionId];
  const agregar = (condicion: (parametro: string) => string, valor: unknown) => {
    parametros.push(valor);
    lista.push(condicion(`$${parametros.length}`));
  };
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
  SELECT h.id::text AS id, h.accion, h.usuario_id, u.nombre AS usuario_nombre, u.email AS usuario_email, h.rol_usuario,
         h.entidad_tipo, h.entidad_id, h.detalle, h.user_agent, h.es_movil, h.creado_en,
         to_char(h.creado_en AT TIME ZONE 'America/Lima', 'YYYY-MM-DD HH24:MI:SS') AS creado_en_lima
  FROM historial h LEFT JOIN usuarios u ON u.id = h.usuario_id`;

async function consultar(db: Consultor, organizacionId: string, filtros: Filtros, limite: number, desde = 0): Promise<FilaAsiento[]> {
  const { where, parametros } = condiciones(organizacionId, filtros);
  const { rows } = await db.query<FilaAsiento>(
    `${SELECCION} WHERE ${where} ORDER BY h.id DESC LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
    [...parametros, limite, desde],
  );
  return rows;
}

function aAsiento(fila: FilaAsiento): Asiento {
  return {
    id: fila.id,
    accion: fila.accion,
    usuario: fila.usuario_id ? { id: fila.usuario_id, nombre: fila.usuario_nombre!, email: fila.usuario_email! } : null,
    rolUsuario: fila.rol_usuario,
    entidad: fila.entidad_tipo ? { tipo: fila.entidad_tipo, id: fila.entidad_id! } : null,
    detalle: fila.detalle,
    userAgent: fila.user_agent,
    esMovil: fila.es_movil,
    creadoEn: fila.creado_en,
  };
}

export function crearServicioHistorial(pool: pg.Pool) {
  return {
    async listar(actor: Actor, filtros: Filtros, paginacion: z.infer<typeof esquemaPaginacion>) {
      const organizacionId = actor.autenticacion.usuario.organizacionId;
      const { where, parametros } = condiciones(organizacionId, filtros);
      const { rows: [conteo] } = await pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM historial h WHERE ${where}`, parametros);
      const filas = await consultar(pool, organizacionId, filtros, paginacion.porPagina, desplazamiento(paginacion));
      return { datos: filas.map(aAsiento), paginacion: { ...paginacion, total: conteo?.total ?? 0 } };
    },

    /**
     * RF20: el historial en CSV, la evidencia del capítulo 3 (R3). Exportarlo también es una acción
     * auditable: la lectura y su registro van en una transacción, y si no se puede registrar no se entrega.
     */
    async exportar(actor: Actor, filtros: Filtros): Promise<string> {
      const { usuario } = actor.autenticacion;
      const filas = await conTransaccion(pool, async (cliente) => {
        const filas = await consultar(cliente, usuario.organizacionId, filtros, MAXIMO_EXPORTABLE);
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
          fila.id, fila.creado_en_lima, fila.creado_en.toISOString(), fila.accion, fila.usuario_nombre, fila.usuario_email,
          fila.rol_usuario, fila.entidad_tipo, fila.entidad_id, fila.es_movil, fila.user_agent, fila.detalle,
        ]),
      );
    },
  };
}

export function crearRutasHistorial(
  servicio: ReturnType<typeof crearServicioHistorial>,
  autenticar: RequestHandler,
  exigir: (permiso: Permiso) => RequestHandler,
): Router {
  const rutas = Router();
  rutas.use(autenticar, exigir('CONSULTAR_HISTORIAL'));

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
