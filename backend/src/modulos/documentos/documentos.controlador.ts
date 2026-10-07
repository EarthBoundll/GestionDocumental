import type { RequestHandler } from 'express';
import { ErrorAplicacion } from '../../compartido/errores.js';
import { esquemaPaginacion } from '../../compartido/paginacion.js';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import type { ServicioTiempos } from '../tiempos-respuesta/tiempos-respuesta.servicio.js';
import {
  esquemaBusqueda, esquemaCambiosDocumento, esquemaFiltrosDelListado, esquemaModoArchivo, esquemaNuevaVersion, esquemaNuevoDocumento, esquemaNumeroDeVersion,
} from './documentos.esquemas.js';
import type { ArchivoRecibido, ServicioDocumentos } from './documentos.servicio.js';

export function crearControladorDocumentos(servicio: ServicioDocumentos, tiempos: ServicioTiempos) {
  const listar: RequestHandler = async (req, res) => {
    const actor = actorDe(req);
    const filtros = esquemaBusqueda.parse(req.query);
    const { datos, paginacion, conFiltros } = await servicio.listar(actor, filtros);
    // Indicador 7: desde que llegó la petición hasta que la respuesta está lista para salir.
    const tiempoRespuestaId = await tiempos.registrar(actor, {
      conFiltros,
      totalResultados: paginacion.total,
      duracionServidorMs: performance.now() - req.recibidaEn,
      esMovil: actor.contexto.esMovil,
    });
    res.json({ datos, paginacion, tiempoRespuestaId });
  };

  const exportarListado: RequestHandler = async (req, res) => {
    const csv = await servicio.exportarListado(actorDe(req), esquemaFiltrosDelListado.parse(req.query));
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="listado-documental-${hoy}.csv"`,
    });
    res.send(csv);
  };

  const subir: RequestHandler = async (req, res) => {
    const actor = actorDe(req);
    const datos = esquemaNuevoDocumento.parse(req.body);
    res.status(201).json(await servicio.subir(actor, datos, archivoDe(req)));
  };

  const versiones: RequestHandler = async (req, res) => {
    res.json(await servicio.versiones(actorDe(req), idDeRuta(req)));
  };

  const subirVersion: RequestHandler = async (req, res) => {
    const { comentario } = esquemaNuevaVersion.parse(req.body);
    res.status(201).json(await servicio.subirVersion(actorDe(req), idDeRuta(req), archivoDe(req), comentario ?? null));
  };

  const restaurarVersion: RequestHandler = async (req, res) => {
    const numero = esquemaNumeroDeVersion.parse(req.params.numero);
    res.status(201).json(await servicio.restaurarVersion(actorDe(req), idDeRuta(req), numero));
  };

  const obtener: RequestHandler = async (req, res) => {
    res.json(await servicio.obtener(actorDe(req), idDeRuta(req)));
  };

  const editar: RequestHandler = async (req, res) => {
    const id = idDeRuta(req);
    const cambios = esquemaCambiosDocumento.parse(req.body);
    res.json(await servicio.editar(actorDe(req), id, cambios));
  };

  const eliminar: RequestHandler = async (req, res) => {
    await servicio.eliminar(actorDe(req), idDeRuta(req));
    res.status(204).end();
  };

  const actividad: RequestHandler = async (req, res) => {
    res.json(await servicio.actividad(actorDe(req), idDeRuta(req), esquemaPaginacion.parse(req.query)));
  };

  const archivo: RequestHandler = async (req, res) => {
    const id = idDeRuta(req);
    const { modo, version } = esquemaModoArchivo.parse(req.query);
    res.json(await servicio.enlaceArchivo(actorDe(req), id, modo, version));
  };

  const papelera: RequestHandler = async (req, res) => {
    res.json(await servicio.papelera(actorDe(req), esquemaPaginacion.parse(req.query)));
  };

  const restaurar: RequestHandler = async (req, res) => {
    res.json(await servicio.restaurar(actorDe(req), idDeRuta(req)));
  };

  const purgar: RequestHandler = async (req, res) => {
    await servicio.purgar(actorDe(req), idDeRuta(req));
    res.status(204).end();
  };

  return { listar, exportarListado, subir, obtener, actividad, editar, eliminar, archivo, papelera, restaurar, purgar, versiones, subirVersion, restaurarVersion };
}

/** El archivo del formulario multipart, o un 400 que dice qué falta. */
function archivoDe(req: Parameters<RequestHandler>[0]): ArchivoRecibido {
  if (!req.file) {
    throw new ErrorAplicacion(400, 'VALIDACION', 'Adjunta el archivo del documento', {
      detalles: [{ campo: 'archivo', mensaje: 'Adjunta el archivo del documento' }],
    });
  }
  return { nombreOriginal: req.file.originalname, contenido: req.file.buffer };
}
