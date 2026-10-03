import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { Almacenamiento } from '../../almacenamiento/almacenamiento.js';
import { calcularCambios, valoresNuevos } from '../../compartido/cambios.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import type { Pagina } from '../../compartido/paginacion.js';
import { empresaDe, type Actor, type UsuarioAutenticado } from '../../compartido/peticion.js';
import { tienePermiso } from '../../compartido/permisos.js';
import { identificarTipo } from '../../compartido/tipos-de-archivo.js';
import { autorDe, denegarAcceso, registrarAccion } from '../historial/historial.registro.js';
import type { CambiosDocumento, FiltrosBusqueda, NuevoDocumento } from './documentos.esquemas.js';
import {
  actualizarDocumento, buscarDocumento, buscarDocumentos, categoriaDeLaEmpresa, insertarDocumento, marcarEliminado,
  type Documento, type DocumentoInterno, type DocumentoResumen,
} from './documentos.repositorio.js';

/** RN18: los enlaces a un archivo caducan a los 5 minutos. */
const VIGENCIA_ENLACE_SEGUNDOS = 300;

export interface Permisos {
  editar: boolean;
  eliminar: boolean;
  solicitarAprobacion: boolean;
  resolverSolicitud: boolean;
}

/**
 * Qué puede hacer este usuario con este documento (RN10–RN13). Es la misma función que decide al
 * editar o eliminar y la que le dice al frontend qué botones mostrar (D8): no pueden divergir.
 */
export function permisosSobre(usuario: UsuarioAutenticado, documento: Documento): Permisos {
  const esPropietario = documento.subidoPor.id === usuario.id;
  const puedeGestionar = esPropietario || tienePermiso(usuario.rol, 'GESTIONAR_CUALQUIER_DOCUMENTO');
  const solicitud = documento.ultimaSolicitud;
  const pendiente = solicitud?.estado === 'pendiente';
  return {
    editar: puedeGestionar,
    eliminar: puedeGestionar && !pendiente,
    solicitarAprobacion: esPropietario && !pendiente,
    resolverSolicitud: pendiente && tienePermiso(usuario.rol, 'RESOLVER_SOLICITUDES') && solicitud.solicitante.id !== usuario.id,
  };
}

export interface ArchivoRecibido {
  nombreOriginal: string;
  contenido: Buffer;
}

export type ServicioDocumentos = ReturnType<typeof crearServicioDocumentos>;

/** Todo pasa por el acceso del actor (D17): el filtro por empresa de cada consulta tiene detrás la RLS. */
export function crearServicioDocumentos({ almacenamiento }: { almacenamiento: Almacenamiento }) {
  async function documentoVigente(actor: Actor, id: string): Promise<DocumentoInterno> {
    const documento = await actor.datos.ejecutar((db) => buscarDocumento(db, empresaDe(actor), id));
    if (!documento) throw noEncontrado('El documento no existe');
    return documento;
  }

  async function exigirGestion(actor: Actor, documento: Documento, operacion: string): Promise<void> {
    if (permisosSobre(actor.autenticacion.usuario, documento).editar) return;
    throw await denegarAcceso(actor, 'GESTIONAR_CUALQUIER_DOCUMENTO', {
      entidad: { tipo: 'documento', id: documento.id },
      detalle: { operacion },
    });
  }

  /** La categoría tiene que ser de la empresa y estar activa (RN08). */
  async function exigirCategoriaUsable(actor: Actor, categoriaId: string) {
    const categoria = await actor.datos.ejecutar((db) => categoriaDeLaEmpresa(db, empresaDe(actor), categoriaId));
    if (!categoria) {
      throw new ErrorAplicacion(400, 'VALIDACION', 'Revisa los datos enviados', {
        detalles: [{ campo: 'categoriaId', mensaje: 'La categoría no existe' }],
      });
    }
    if (!categoria.activa) {
      throw new ErrorAplicacion(409, 'CATEGORIA_INACTIVA', `La categoría «${categoria.nombre}» está desactivada`);
    }
    return categoria;
  }

  return {
    /** Listado y búsqueda (RF10). Con algún filtro es una búsqueda, y se registra con su número de resultados. */
    async listar(actor: Actor, filtros: FiltrosBusqueda): Promise<Pagina<DocumentoResumen> & { conFiltros: boolean }> {
      const { usuario } = actor.autenticacion;
      const conFiltros = Boolean(filtros.q || filtros.categoriaId || filtros.desde || filtros.hasta);
      const { filas, total } = await actor.datos.ejecutar(async (cliente) => {
        const resultado = await buscarDocumentos(cliente, empresaDe(actor), filtros);
        if (!conFiltros) return resultado;
        await registrarAccion(cliente, {
          accion: 'BUSQUEDA_REALIZADA',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          detalle: {
            filtros: { q: filtros.q, categoriaId: filtros.categoriaId, desde: filtros.desde, hasta: filtros.hasta },
            resultados: resultado.total,
          },
        });
        return resultado;
      });
      return {
        datos: filas,
        paginacion: { pagina: filtros.pagina, porPagina: filtros.porPagina, total },
        conFiltros,
      };
    },

    async subir(actor: Actor, datos: NuevoDocumento, archivo: ArchivoRecibido): Promise<Documento> {
      const { usuario } = actor.autenticacion;
      const nombreOriginal = basename(archivo.nombreOriginal.replaceAll('\\', '/')).slice(-255);
      const tipo = identificarTipo(nombreOriginal, archivo.contenido);
      const empresaId = empresaDe(actor);
      const categoria = await exigirCategoriaUsable(actor, datos.categoriaId);
      const id = randomUUID();
      const ruta = `${empresaId}/${id}.${tipo.extension}`;

      // El archivo sube antes que la fila: un fallo después deja, como mucho, un archivo huérfano que se
      // intenta borrar; al revés, dejaría un documento que apunta a un archivo inexistente (§4.2).
      await almacenamiento.subir(ruta, archivo.contenido, tipo.mime);
      try {
        await actor.datos.ejecutar(async (cliente) => {
          await insertarDocumento(cliente, {
            id,
            empresaId,
            categoriaId: categoria.id,
            subidoPor: usuario.id,
            nombre: datos.nombre,
            descripcion: datos.descripcion ?? null,
            fechaDocumento: datos.fechaDocumento,
            archivoNombreOriginal: nombreOriginal,
            archivoRuta: ruta,
            archivoTipoMime: tipo.mime,
            archivoPesoBytes: archivo.contenido.length,
          });
          await registrarAccion(cliente, {
            accion: 'DOCUMENTO_SUBIDO',
            autor: autorDe(usuario),
            contexto: actor.contexto,
            entidad: { tipo: 'documento', id },
            detalle: { nombre: datos.nombre, categoria: categoria.nombre, tipo: tipo.mime, pesoBytes: archivo.contenido.length },
          });
        });
      } catch (error) {
        await almacenamiento.eliminar(ruta).catch((errorAlBorrar: unknown) => {
          console.error(`[almacenamiento] quedó un archivo huérfano en ${ruta}:`, errorAlBorrar);
        });
        throw error;
      }
      return publico(await documentoVigente(actor, id));
    },

    async obtener(actor: Actor, id: string): Promise<Documento & { permisos: Permisos }> {
      const documento = await documentoVigente(actor, id);
      return { ...publico(documento), permisos: permisosSobre(actor.autenticacion.usuario, documento) };
    },

    async editar(actor: Actor, id: string, propuesta: CambiosDocumento): Promise<Documento> {
      const { usuario } = actor.autenticacion;
      const documento = await documentoVigente(actor, id);
      await exigirGestion(actor, documento, 'EDITAR_DOCUMENTO');
      const actual = {
        nombre: documento.nombre,
        categoriaId: documento.categoria.id,
        fechaDocumento: documento.fechaDocumento,
        descripcion: documento.descripcion,
      };
      const cambios = calcularCambios(actual, propuesta);
      if (Object.keys(cambios).length === 0) return publico(documento);
      if (cambios.categoriaId) await exigirCategoriaUsable(actor, String(cambios.categoriaId.despues));

      await actor.datos.ejecutar(async (cliente) => {
        await actualizarDocumento(cliente, empresaDe(actor), id, valoresNuevos(cambios));
        await registrarAccion(cliente, {
          accion: 'DOCUMENTO_EDITADO',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          entidad: { tipo: 'documento', id },
          detalle: { cambios },
        });
      });
      return publico(await documentoVigente(actor, id));
    },

    async eliminar(actor: Actor, id: string): Promise<void> {
      const { usuario } = actor.autenticacion;
      const documento = await documentoVigente(actor, id);
      await exigirGestion(actor, documento, 'ELIMINAR_DOCUMENTO');
      if (documento.ultimaSolicitud?.estado === 'pendiente') {
        throw new ErrorAplicacion(409, 'DOCUMENTO_EN_REVISION', 'No se puede eliminar mientras tenga una solicitud de aprobación pendiente');
      }
      await actor.datos.ejecutar(async (cliente) => {
        await marcarEliminado(cliente, empresaDe(actor), id);
        await registrarAccion(cliente, {
          accion: 'DOCUMENTO_ELIMINADO',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          entidad: { tipo: 'documento', id },
          detalle: { nombre: documento.nombre },
        });
      });
    },

    /**
     * Un enlace temporal para ver o descargar el archivo (RF11). El enlace se firma antes de registrar y
     * se entrega después: si el registro falla, el enlace existe pero nadie lo recibe (RN16, §4.3).
     */
    async enlaceArchivo(actor: Actor, id: string, modo: 'ver' | 'descargar'): Promise<{ url: string; expiraEn: string }> {
      const documento = await documentoVigente(actor, id);
      const url = await almacenamiento.firmarEnlace(documento.archivoRuta, {
        segundos: VIGENCIA_ENLACE_SEGUNDOS,
        tipoMime: documento.archivo.tipoMime,
        ...(modo === 'descargar' && { descargarComo: documento.archivo.nombreOriginal }),
      });
      await actor.datos.ejecutar((db) => registrarAccion(db, {
        accion: modo === 'descargar' ? 'DOCUMENTO_DESCARGADO' : 'DOCUMENTO_VISUALIZADO',
        autor: autorDe(actor.autenticacion.usuario),
        contexto: actor.contexto,
        entidad: { tipo: 'documento', id },
        // El nombre de ese momento: el documento puede renombrarse después, y el indicador 3 se lee del CSV.
        detalle: { nombre: documento.nombre },
      }));
      return { url, expiraEn: new Date(Date.now() + VIGENCIA_ENLACE_SEGUNDOS * 1000).toISOString() };
    },
  };
}

function publico({ archivoRuta: _ruta, ...documento }: DocumentoInterno): Documento {
  return documento;
}
