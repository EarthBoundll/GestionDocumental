import { Router, type RequestHandler } from 'express';
import { ErrorAplicacion } from '../../compartido/errores.js';
import { actorDe, empresaDe } from '../../compartido/peticion.js';
import type { Exigir } from '../../middlewares/autorizar.js';
import { recibirArchivo } from '../../middlewares/recibir-archivo.js';
import { autorDe } from '../historial/historial.registro.js';
import { esquemaIdentidad } from './identidad.esquemas.js';
import { IMAGENES, type ArchivoDeImagen, type Imagen } from './identidad.imagenes.js';
import type { ServicioIdentidad } from './identidad.servicio.js';

/** El logo y el fondo tienen las mismas dos rutas: /logo y /fondo, para cambiarlos y para quitarlos. */
export const IMAGENES_DE_IDENTIDAD = Object.keys(IMAGENES) as Imagen[];

/** El archivo del formulario multipart, o un 400 que dice qué falta. */
export function imagenDe(req: Parameters<RequestHandler>[0], imagen: Imagen): ArchivoDeImagen {
  if (!req.file) {
    const mensaje = `Adjunta la imagen del ${imagen}`;
    throw new ErrorAplicacion(400, 'VALIDACION', mensaje, { detalles: [{ campo: 'archivo', mensaje }] });
  }
  return { nombreOriginal: req.file.originalname, contenido: req.file.buffer };
}

/**
 * La identidad de la empresa del actor (RF31). La ven todos los de la empresa; la cambia su
 * administrador. La empresa sale siempre de la sesión, nunca de la petición.
 */
export function crearRutasIdentidad(servicio: ServicioIdentidad, entrar: RequestHandler, exigir: Exigir): Router {
  const rutas = Router();
  rutas.use(entrar);

  rutas.get('/', async (req, res) => {
    const actor = actorDe(req);
    res.json(await servicio.obtener(actor, empresaDe(actor)));
  });

  rutas.patch('/', exigir('GESTIONAR_IDENTIDAD'), async (req, res) => {
    const actor = actorDe(req);
    const cambios = esquemaIdentidad.parse(req.body);
    res.json(await servicio.editar(actor, empresaDe(actor), autorDe(actor.autenticacion.usuario), cambios));
  });

  for (const imagen of IMAGENES_DE_IDENTIDAD) {
    rutas.put(`/${imagen}`, exigir('GESTIONAR_IDENTIDAD'), recibirArchivo, async (req, res) => {
      const actor = actorDe(req);
      res.json(await servicio.cambiarImagen(actor, empresaDe(actor), autorDe(actor.autenticacion.usuario), imagen, imagenDe(req, imagen)));
    });

    rutas.delete(`/${imagen}`, exigir('GESTIONAR_IDENTIDAD'), async (req, res) => {
      const actor = actorDe(req);
      res.json(await servicio.quitarImagen(actor, empresaDe(actor), autorDe(actor.autenticacion.usuario), imagen));
    });
  }

  return rutas;
}
