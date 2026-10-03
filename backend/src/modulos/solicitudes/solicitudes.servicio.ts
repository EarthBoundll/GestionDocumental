import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import type { Pagina } from '../../compartido/paginacion.js';
import { empresaDe, type Actor } from '../../compartido/peticion.js';
import { tienePermiso } from '../../compartido/permisos.js';
import { violaRestriccion } from '../../db/errores-postgres.js';
import { buscarDocumento } from '../documentos/documentos.repositorio.js';
import { autorDe, denegarAcceso, registrarAccion } from '../historial/historial.registro.js';
import { insertarNotificaciones } from '../notificaciones/notificaciones.repositorio.js';
import type { FiltroSolicitudes, Resolucion } from './solicitudes.esquemas.js';
import {
  buscarSolicitud, insertarSolicitud, listarSolicitudes, resolverSiPendiente, revisoresPosibles, type Solicitud,
} from './solicitudes.repositorio.js';

const yaPendiente = () =>
  new ErrorAplicacion(409, 'SOLICITUD_PENDIENTE', 'Este documento ya tiene una solicitud de aprobación pendiente');

/** Las notificaciones tienen 300 caracteres: un nombre de documento muy largo se recorta. */
function recortar(texto: string, maximo = 120): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

export type ServicioSolicitudes = ReturnType<typeof crearServicioSolicitudes>;

/** El flujo de aprobación de un nivel (RF15–RF17, §4.4). */
export function crearServicioSolicitudes() {
  async function solicitudDeLaEmpresa(actor: Actor, id: string): Promise<Solicitud> {
    const solicitud = await actor.datos.ejecutar((db) => buscarSolicitud(db, empresaDe(actor), id));
    if (!solicitud) throw noEncontrado('La solicitud no existe');
    return solicitud;
  }

  return {
    async crear(actor: Actor, documentoId: string, { comentario }: { comentario?: string | null | undefined }): Promise<Solicitud> {
      const { usuario } = actor.autenticacion;
      const empresaId = empresaDe(actor);
      const documento = await actor.datos.ejecutar((db) => buscarDocumento(db, empresaId, documentoId));
      if (!documento) throw noEncontrado('El documento no existe');
      // RN12: solo quien lo subió pide su aprobación, también si es administrador.
      if (documento.subidoPor.id !== usuario.id) {
        throw await denegarAcceso(actor, 'SER_PROPIETARIO', {
          entidad: { tipo: 'documento', id: documento.id },
          detalle: { operacion: 'SOLICITAR_APROBACION' },
        });
      }
      if (documento.ultimaSolicitud?.estado === 'pendiente') throw yaPendiente();
      const revisores = await actor.datos.ejecutar((db) => revisoresPosibles(db, empresaId, usuario.id));
      if (revisores.length === 0) {
        throw new ErrorAplicacion(409, 'SIN_REVISOR', 'No hay otro administrador activo que pueda resolver tu solicitud');
      }

      try {
        const id = await actor.datos.ejecutar(async (cliente) => {
          const id = await insertarSolicitud(cliente, {
            empresaId, documentoId, solicitanteId: usuario.id, comentario: comentario ?? null,
          });
          await registrarAccion(cliente, {
            accion: 'SOLICITUD_CREADA',
            autor: autorDe(usuario),
            contexto: actor.contexto,
            entidad: { tipo: 'solicitud', id },
            detalle: { documentoId, documento: documento.nombre, comentario: comentario ?? null },
          });
          // RN15: a todos los administradores que pueden resolverla.
          await insertarNotificaciones(cliente, empresaId, revisores.map((revisorId) => ({
            usuarioId: revisorId,
            solicitudId: id,
            tipo: 'SOLICITUD_CREADA',
            mensaje: `${usuario.nombre} pide aprobar «${recortar(documento.nombre)}»`,
          })));
          return id;
        });
        return solicitudDeLaEmpresa(actor, id);
      } catch (error) {
        // Dos peticiones a la vez: la base admite una sola pendiente por documento (M6).
        if (violaRestriccion(error, 'solicitudes_una_pendiente_por_documento')) throw yaPendiente();
        throw error;
      }
    },

    /** El administrador ve las de toda la empresa; los demás, las suyas. */
    async listar(actor: Actor, filtro: FiltroSolicitudes): Promise<Pagina<Solicitud>> {
      const { usuario } = actor.autenticacion;
      const soloDe = tienePermiso(usuario.rol, 'VER_TODAS_LAS_SOLICITUDES') ? undefined : usuario.id;
      const { filas, total } = await actor.datos.ejecutar((db) => listarSolicitudes(db, empresaDe(actor), { ...filtro, soloDe }));
      return { datos: filas, paginacion: { pagina: filtro.pagina, porPagina: filtro.porPagina, total } };
    },

    /** Solo llega quien tiene RESOLVER_SOLICITUDES: lo exige la ruta. */
    async resolver(actor: Actor, id: string, { decision, comentario }: Resolucion): Promise<Solicitud> {
      const { usuario } = actor.autenticacion;
      const solicitud = await solicitudDeLaEmpresa(actor, id);
      // RN13: nadie aprueba lo suyo. Es control de acceso, y se registra como tal (indicador 6).
      if (solicitud.solicitante.id === usuario.id) {
        throw await denegarAcceso(actor, 'NO_SER_EL_SOLICITANTE', {
          entidad: { tipo: 'solicitud', id },
          detalle: { operacion: 'RESOLVER_SOLICITUD' },
        });
      }
      const solicitudResuelta = () => new ErrorAplicacion(409, 'SOLICITUD_RESUELTA', 'Esta solicitud ya está resuelta');
      if (solicitud.estado !== 'pendiente') throw solicitudResuelta();

      await actor.datos.ejecutar(async (cliente) => {
        const resuelta = await resolverSiPendiente(cliente, {
          empresaId: empresaDe(actor), id, estado: decision, revisorId: usuario.id, comentario: comentario ?? null,
        });
        if (!resuelta) throw solicitudResuelta();
        await registrarAccion(cliente, {
          accion: decision === 'aprobada' ? 'SOLICITUD_APROBADA' : 'SOLICITUD_RECHAZADA',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          entidad: { tipo: 'solicitud', id },
          detalle: { documentoId: solicitud.documento.id, documento: solicitud.documento.nombre, comentario: comentario ?? null },
        });
        const documento = recortar(solicitud.documento.nombre);
        await insertarNotificaciones(cliente, empresaDe(actor), [{
          usuarioId: solicitud.solicitante.id,
          solicitudId: id,
          tipo: decision === 'aprobada' ? 'SOLICITUD_APROBADA' : 'SOLICITUD_RECHAZADA',
          mensaje: decision === 'aprobada'
            ? `${usuario.nombre} aprobó «${documento}»`
            : recortar(`${usuario.nombre} rechazó «${documento}»: ${comentario}`, 300),
        }]);
      });
      return solicitudDeLaEmpresa(actor, id);
    },
  };
}
