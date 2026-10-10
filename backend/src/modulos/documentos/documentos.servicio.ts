import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { Almacenamiento } from '../../almacenamiento/almacenamiento.js';
import { calcularCambios, valoresNuevos } from '../../compartido/cambios.js';
import { aCsv } from '../../compartido/csv.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import type { Pagina, Paginacion } from '../../compartido/paginacion.js';
import { empresaDe, type Actor, type UsuarioAutenticado } from '../../compartido/peticion.js';
import { tienePermiso } from '../../compartido/permisos.js';
import { identificarTipo, nombreDeTipo } from '../../compartido/tipos-de-archivo.js';
import { actividadDeDocumento, type ActividadDeDocumento } from '../historial/historial.consulta.js';
import { autorDe, denegarAcceso, registrarAccion } from '../historial/historial.registro.js';
import { admiteParecidos, terminosDeBusqueda } from './busqueda.js';
import type { CambiosDocumento, FiltrosBusqueda, FiltrosDelListado, NuevoDocumento, SugerenciaElegida } from './documentos.esquemas.js';
import {
  actualizarDocumento, bloquearEnPapelera, buscarDocumento, buscarDocumentos, categoriaDeLaEmpresa, insertarDocumento,
  listadoDocumental, listarPapelera, marcarEliminado, marcarPurgado, restaurarDocumento, sugerirDocumentos,
  type Documento, type DocumentoEnPapelera, type DocumentoInterno, type DocumentoResumen, type Sugerencia,
} from './documentos.repositorio.js';
import {
  bloquearParaVersion, buscarVersion, hacerVigente, insertarVersion, listarVersiones, rutasDeVersiones,
  type NuevaVersion, type Version, type VersionInterna,
} from './versiones.repositorio.js';

/** RN18: los enlaces a un archivo caducan a los 5 minutos. */
const VIGENCIA_ENLACE_SEGUNDOS = 300;

/**
 * RF35: el listado documental sale entero o no sale. Una MYPE no se acerca a esto; el tope protege la
 * memoria de Render (512 MB) y, si se pasa, se pide filtrar en vez de entregar un inventario cortado.
 */
export const MAXIMO_EN_EL_LISTADO = 50_000;

/** Cuántas sugerencias se ofrecen mientras se escribe: las que caben en un celular sin tapar el teclado. */
export const MAXIMO_DE_SUGERENCIAS = 5;

/** RF26: lo eliminado se puede restaurar durante 30 días; después se purga solo (src/tareas/purgar-papelera.ts). */
export const DIAS_EN_PAPELERA = 30;

export interface Permisos {
  editar: boolean;
  eliminar: boolean;
  solicitarAprobacion: boolean;
  resolverSolicitud: boolean;
  /** Subir una versión o restaurar una anterior (RF34): quien puede editarlo, sin solicitud pendiente. */
  versionar: boolean;
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
    versionar: puedeGestionar && !pendiente,
  };
}

/**
 * Los filtros de una búsqueda o de un listado, como quedan en el historial: los que se usaron, y de qué
 * fecha hablan «desde» y «hasta» solo si no es la del documento, la de siempre.
 */
function filtrosParaElHistorial(filtros: FiltrosDelListado) {
  const { q, categoriaId, desde, hasta, tipo, estado, subidoPor, fechaDe } = filtros;
  return { q, categoriaId, desde, hasta, tipo, estado, subidoPor, ...((desde || hasta) && fechaDe === 'subida' && { fechaDe }) };
}

/** Una versión vista desde fuera: sin la ruta del archivo, y diciendo si es la vigente. */
export type VersionPublica = Version & { vigente: boolean };

const enRevision = (que: string) =>
  new ErrorAplicacion(409, 'DOCUMENTO_EN_REVISION', `No se puede ${que} mientras tenga una solicitud de aprobación pendiente`);

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

  /**
   * Guarda una versión cuyo archivo ya está en el almacenamiento y la hace vigente, con su asiento. Si
   * algo falla, se borra el archivo: no queda una versión a medias ni un archivo sin dueño.
   */
  async function guardarVersion(
    actor: Actor,
    documentoId: string,
    ruta: string,
    datos: Pick<NuevaVersion, 'archivoNombreOriginal' | 'archivoTipoMime' | 'archivoPesoBytes' | 'comentario' | 'restauradaDe'>,
  ): Promise<void> {
    const { usuario } = actor.autenticacion;
    const empresaId = empresaDe(actor);
    try {
      await actor.datos.ejecutar(async (cliente) => {
        const vigente = await bloquearParaVersion(cliente, empresaId, documentoId);
        if (!vigente) throw noEncontrado('El documento no existe');
        if (vigente.pendiente) throw enRevision(datos.restauradaDe ? 'restaurar una versión' : 'subir una versión');
        const version: NuevaVersion = { empresaId, documentoId, numero: vigente.version + 1, archivoRuta: ruta, subidaPor: usuario.id, ...datos };
        await insertarVersion(cliente, version);
        await hacerVigente(cliente, version);
        await registrarAccion(cliente, {
          accion: datos.restauradaDe ? 'VERSION_RESTAURADA' : 'VERSION_SUBIDA',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          entidad: { tipo: 'documento', id: documentoId },
          detalle: {
            nombre: vigente.nombre,
            version: version.numero,
            ...(datos.restauradaDe ? { desde: datos.restauradaDe } : { archivo: datos.archivoNombreOriginal, comentario: datos.comentario }),
          },
        });
      });
    } catch (error) {
      await almacenamiento.eliminar(ruta).catch((errorAlBorrar: unknown) => {
        console.error(`[almacenamiento] quedó un archivo huérfano en ${ruta}:`, errorAlBorrar);
      });
      throw error;
    }
  }

  return {
    /**
     * Listado y búsqueda (RF10, D42). Con algún filtro es una búsqueda, y se registra con su número de
     * resultados. Si el texto no encontró nada, una segunda pasada busca palabras parecidas (errores de
     * escritura): sus resultados se marcan como aproximados y nunca se mezclan con los exactos.
     */
    async listar(actor: Actor, filtros: FiltrosBusqueda): Promise<Pagina<DocumentoResumen> & { conFiltros: boolean; aproximada: boolean }> {
      const { usuario } = actor.autenticacion;
      const conFiltros = Boolean(filtros.q || filtros.categoriaId || filtros.desde || filtros.hasta
        || filtros.tipo || filtros.estado || filtros.subidoPor);
      const orden = filtros.orden ?? (filtros.q ? 'relevancia' : 'recientes');
      const { filas, total, aproximada } = await actor.datos.ejecutar(async (cliente) => {
        const exacta = await buscarDocumentos(cliente, empresaDe(actor), filtros, { orden });
        const probarParecidos = exacta.total === 0 && filtros.q !== undefined && admiteParecidos(terminosDeBusqueda(filtros.q));
        const parecida = probarParecidos ? await buscarDocumentos(cliente, empresaDe(actor), filtros, { orden, parecidos: true }) : null;
        const resultado = { ...(parecida ?? exacta), aproximada: Boolean(parecida && parecida.total > 0) };
        if (!conFiltros) return resultado;
        await registrarAccion(cliente, {
          accion: 'BUSQUEDA_REALIZADA',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          detalle: {
            filtros: filtrosParaElHistorial(filtros),
            resultados: resultado.total,
            ...(resultado.aproximada && { aproximada: true }),
          },
        });
        return resultado;
      });
      return {
        datos: filas,
        paginacion: { pagina: filtros.pagina, porPagina: filtros.porPagina, total },
        conFiltros,
        aproximada,
      };
    },

    /**
     * Sugerencias mientras se escribe (D42). Con la misma consulta y la misma RLS que la búsqueda, así que
     * no adelantan nada que la persona no pueda ver. No se registran: son letras a medio escribir (D36).
     */
    async sugerencias(actor: Actor, q: string): Promise<Sugerencia[]> {
      return actor.datos.ejecutar((db) => sugerirDocumentos(db, empresaDe(actor), q, MAXIMO_DE_SUGERENCIAS));
    },

    /**
     * Quien elige una sugerencia hizo una búsqueda que encontró lo que buscaba: se registra como tal, con
     * el documento elegido (indicadores 2 y 3). Solo si ese documento es uno que puede ver.
     */
    async registrarSugerenciaElegida(actor: Actor, { q, documentoId }: SugerenciaElegida): Promise<void> {
      const documento = await documentoVigente(actor, documentoId);
      await actor.datos.ejecutar((cliente) => registrarAccion(cliente, {
        accion: 'BUSQUEDA_REALIZADA',
        autor: autorDe(actor.autenticacion.usuario),
        contexto: actor.contexto,
        detalle: { filtros: { q }, resultados: 1, origen: 'sugerencia', documento: documento.nombre, documentoId },
      }));
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
          // Todo documento nace con su versión 1 (D30): las siguientes se suman, nunca la reemplazan.
          await insertarVersion(cliente, {
            empresaId, documentoId: id, numero: 1, archivoNombreOriginal: nombreOriginal, archivoRuta: ruta,
            archivoTipoMime: tipo.mime, archivoPesoBytes: archivo.contenido.length, subidaPor: usuario.id,
            comentario: null, restauradaDe: null,
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

    /**
     * La línea de tiempo de la ficha: el indicador 4, documento por documento. Solo de un documento que el
     * actor ve, así que respeta el aislamiento y las categorías restringidas. Consultarla no se registra,
     * igual que ver la ficha (docs/01-analisis.md §7).
     */
    async actividad(actor: Actor, id: string, paginacion: Paginacion): Promise<Pagina<ActividadDeDocumento>> {
      await documentoVigente(actor, id);
      const conConsultas = tienePermiso(actor.autenticacion.usuario.rol, 'CONSULTAR_HISTORIAL');
      const { filas, total } = await actor.datos.ejecutar((db) =>
        actividadDeDocumento(db, empresaDe(actor), id, { conConsultas, paginacion }));
      return { datos: filas, paginacion: { ...paginacion, total } };
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
        await marcarEliminado(cliente, empresaDe(actor), id, usuario.id);
        await registrarAccion(cliente, {
          accion: 'DOCUMENTO_ELIMINADO',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          entidad: { tipo: 'documento', id },
          detalle: { nombre: documento.nombre },
        });
      });
    },

    /** RF34: las versiones del documento, la más reciente primero. Consultarlas no se registra, como la ficha. */
    async versiones(actor: Actor, id: string): Promise<{ datos: VersionPublica[] }> {
      const documento = await documentoVigente(actor, id);
      const versiones = await actor.datos.ejecutar((db) => listarVersiones(db, empresaDe(actor), id));
      return { datos: versiones.map((version) => ({ ...versionPublica(version), vigente: version.numero === documento.version })) };
    },

    /**
     * Sube una versión nueva y la hace vigente (RF34). El archivo sube antes que la fila, como al subir
     * un documento; el número se decide con el documento bloqueado, así que dos subidas a la vez no
     * chocan. Una solicitud pendiente lo impide: se estaría revisando un archivo que cambió.
     */
    async subirVersion(actor: Actor, id: string, archivo: ArchivoRecibido, comentario: string | null): Promise<Documento> {
      const documento = await documentoVigente(actor, id);
      await exigirGestion(actor, documento, 'SUBIR_VERSION');
      if (documento.ultimaSolicitud?.estado === 'pendiente') throw enRevision('subir una versión');
      const nombreOriginal = basename(archivo.nombreOriginal.replaceAll('\\', '/')).slice(-255);
      const tipo = identificarTipo(nombreOriginal, archivo.contenido);
      const empresaId = empresaDe(actor);
      const ruta = `${empresaId}/${randomUUID()}.${tipo.extension}`;
      await almacenamiento.subir(ruta, archivo.contenido, tipo.mime);
      await guardarVersion(actor, id, ruta, {
        archivoNombreOriginal: nombreOriginal, archivoTipoMime: tipo.mime, archivoPesoBytes: archivo.contenido.length,
        comentario, restauradaDe: null,
      });
      return publico(await documentoVigente(actor, id));
    },

    /**
     * Restaurar no retrocede (D30): copia el archivo de una versión anterior como versión nueva, y la
     * historia queda entera. La copia no pasa por la API: la hace el almacenamiento.
     */
    async restaurarVersion(actor: Actor, id: string, numero: number): Promise<Documento> {
      const documento = await documentoVigente(actor, id);
      await exigirGestion(actor, documento, 'RESTAURAR_VERSION');
      if (documento.ultimaSolicitud?.estado === 'pendiente') throw enRevision('restaurar una versión');
      const empresaId = empresaDe(actor);
      const anterior = await actor.datos.ejecutar((db) => buscarVersion(db, empresaId, id, numero));
      if (!anterior) throw noEncontrado('La versión no existe');
      if (anterior.numero === documento.version) {
        throw new ErrorAplicacion(409, 'VERSION_VIGENTE', `La versión ${numero} ya es la vigente`);
      }
      const extension = anterior.archivoRuta.split('.').pop();
      const ruta = `${empresaId}/${randomUUID()}.${extension}`;
      await almacenamiento.copiar(anterior.archivoRuta, ruta);
      await guardarVersion(actor, id, ruta, {
        archivoNombreOriginal: anterior.archivo.nombreOriginal, archivoTipoMime: anterior.archivo.tipoMime,
        archivoPesoBytes: anterior.archivo.pesoBytes, comentario: null, restauradaDe: numero,
      });
      return publico(await documentoVigente(actor, id));
    },

    /**
     * RF35: el inventario documental en CSV. Exportarlo queda en el historial, como el historial mismo: la
     * lectura y su asiento van en una transacción, y si no se puede registrar no se entrega.
     */
    async exportarListado(actor: Actor, filtros: FiltrosDelListado): Promise<string> {
      const { usuario } = actor.autenticacion;
      const filas = await actor.datos.ejecutar(async (cliente) => {
        const filas = await listadoDocumental(cliente, empresaDe(actor), filtros, MAXIMO_EN_EL_LISTADO + 1);
        if (filas.length > MAXIMO_EN_EL_LISTADO) {
          throw new ErrorAplicacion(400, 'VALIDACION',
            `El listado pasa de ${MAXIMO_EN_EL_LISTADO.toLocaleString('es-PE')} documentos: filtra por categoría o por fechas`);
        }
        await registrarAccion(cliente, {
          accion: 'LISTADO_EXPORTADO',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          detalle: { filtros: filtrosParaElHistorial(filtros), filas: filas.length },
        });
        return filas;
      });
      return aCsv(
        ['id', 'nombre', 'categoria', 'fecha_documento', 'descripcion', 'subido_por', 'subido_en_lima', 'tipo', 'peso_bytes',
          'version_vigente', 'estado_aprobacion', 'version_revisada'],
        filas.map((fila) => [
          fila.id, fila.nombre, fila.categoria, fila.fecha_documento, fila.descripcion, fila.subido_por, fila.subido_en_lima,
          nombreDeTipo(fila.archivo_tipo_mime), fila.archivo_peso_bytes, fila.version, fila.estado_aprobacion ?? 'sin solicitud',
          fila.version_revisada,
        ]),
      );
    },

    /** Lo eliminado que aún se puede restaurar, lo más reciente primero (RF26). Solo para administradores. */
    async papelera(actor: Actor, paginacion: Paginacion): Promise<Pagina<DocumentoEnPapelera> & { diasEnPapelera: number }> {
      const { filas, total } = await actor.datos.ejecutar((db) =>
        listarPapelera(db, empresaDe(actor), { ...paginacion, dias: DIAS_EN_PAPELERA }));
      return { datos: filas, paginacion: { ...paginacion, total }, diasEnPapelera: DIAS_EN_PAPELERA };
    },

    /** Saca un documento de la papelera tal como estaba: su categoría, su archivo y sus solicitudes. */
    async restaurar(actor: Actor, id: string): Promise<Documento> {
      const { usuario } = actor.autenticacion;
      const empresaId = empresaDe(actor);
      await actor.datos.ejecutar(async (cliente) => {
        const documento = await bloquearEnPapelera(cliente, empresaId, id);
        if (!documento) throw noEncontrado('El documento no está en la papelera');
        await restaurarDocumento(cliente, empresaId, id);
        await registrarAccion(cliente, {
          accion: 'DOCUMENTO_RESTAURADO',
          autor: autorDe(usuario),
          contexto: actor.contexto,
          entidad: { tipo: 'documento', id },
          detalle: { nombre: documento.nombre },
        });
      });
      return publico(await documentoVigente(actor, id));
    },

    /**
     * Elimina para siempre un documento de la papelera: su archivo sale del almacenamiento y la fila
     * queda como constancia. El archivo se borra dentro de la transacción y antes de marcar la fila: si
     * el borrado falla no se marca nada, y si falla lo de después, repetirlo es inofensivo.
     */
    async purgar(actor: Actor, id: string): Promise<void> {
      const { usuario } = actor.autenticacion;
      const empresaId = empresaDe(actor);
      await actor.datos.ejecutar(async (cliente) => {
        const documento = await bloquearEnPapelera(cliente, empresaId, id);
        if (!documento) throw noEncontrado('El documento no está en la papelera');
        for (const ruta of await rutasAPurgar(cliente, empresaId, documento)) await almacenamiento.eliminar(ruta);
        await marcarPurgado(cliente, empresaId, id);
        await registrarAccion(cliente, {
          accion: 'DOCUMENTO_PURGADO',
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
    async enlaceArchivo(actor: Actor, id: string, modo: 'ver' | 'descargar', numero?: number): Promise<{ url: string; expiraEn: string }> {
      const documento = await documentoVigente(actor, id);
      // Una versión anterior (RF34) se ve y se descarga igual que la vigente, con su propio archivo.
      const version = numero === undefined || numero === documento.version
        ? { numero: documento.version, archivoRuta: documento.archivoRuta, archivo: documento.archivo }
        : await actor.datos.ejecutar((db) => buscarVersion(db, empresaDe(actor), id, numero));
      if (!version) throw noEncontrado('La versión no existe');
      const url = await almacenamiento.firmarEnlace(version.archivoRuta, {
        segundos: VIGENCIA_ENLACE_SEGUNDOS,
        tipoMime: version.archivo.tipoMime,
        ...(modo === 'descargar' && { descargarComo: version.archivo.nombreOriginal }),
      });
      await actor.datos.ejecutar((db) => registrarAccion(db, {
        accion: modo === 'descargar' ? 'DOCUMENTO_DESCARGADO' : 'DOCUMENTO_VISUALIZADO',
        autor: autorDe(actor.autenticacion.usuario),
        contexto: actor.contexto,
        entidad: { tipo: 'documento', id },
        // El nombre de ese momento: el documento puede renombrarse después, y el indicador 3 se lee del CSV.
        detalle: { nombre: documento.nombre, version: version.numero },
      }));
      return { url, expiraEn: new Date(Date.now() + VIGENCIA_ENLACE_SEGUNDOS * 1000).toISOString() };
    },
  };
}

function publico({ archivoRuta: _ruta, ...documento }: DocumentoInterno): Documento {
  return documento;
}

function versionPublica({ archivoRuta: _ruta, ...version }: VersionInterna): Version {
  return version;
}

/**
 * Los archivos que borra la purga: los de todas las versiones (D30) y, por si acaso, el vigente. Un
 * documento sin versiones solo puede venir de antes de la 009, que les creó la primera.
 */
export async function rutasAPurgar(
  db: Parameters<typeof rutasDeVersiones>[0],
  empresaId: string,
  documento: { id: string; archivoRuta: string },
): Promise<string[]> {
  return [...new Set([...(await rutasDeVersiones(db, empresaId, documento.id)), documento.archivoRuta])];
}
