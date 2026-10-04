import type { RequestHandler } from 'express';
import { ErrorAplicacion } from '../../compartido/errores.js';
import { esquemaPaginacion } from '../../compartido/paginacion.js';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import type { ServicioTiempos } from '../tiempos-respuesta/tiempos-respuesta.servicio.js';
import { esquemaBusqueda, esquemaCambiosDocumento, esquemaModoArchivo, esquemaNuevoDocumento } from './documentos.esquemas.js';
import type { ServicioDocumentos } from './documentos.servicio.js';

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

  const subir: RequestHandler = async (req, res) => {
    const actor = actorDe(req);
    if (!req.file) {
      throw new ErrorAplicacion(400, 'VALIDACION', 'Adjunta el archivo del documento', {
        detalles: [{ campo: 'archivo', mensaje: 'Adjunta el archivo del documento' }],
      });
    }
    const datos = esquemaNuevoDocumento.parse(req.body);
    const documento = await servicio.subir(actor, datos, { nombreOriginal: req.file.originalname, contenido: req.file.buffer });
    res.status(201).json(documento);
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
    const { modo } = esquemaModoArchivo.parse(req.query);
    res.json(await servicio.enlaceArchivo(actorDe(req), id, modo));
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

  return { listar, subir, obtener, actividad, editar, eliminar, archivo, papelera, restaurar, purgar };
}
