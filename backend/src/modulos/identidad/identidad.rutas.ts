import { Router, type RequestHandler } from 'express';
import { ErrorAplicacion } from '../../compartido/errores.js';
import { actorDe, empresaDe } from '../../compartido/peticion.js';
import type { Exigir } from '../../middlewares/autorizar.js';
import { recibirArchivo } from '../../middlewares/recibir-archivo.js';
import { autorDe } from '../historial/historial.registro.js';
import { esquemaIdentidad } from './identidad.esquemas.js';
import type { ArchivoDeLogo, ServicioIdentidad } from './identidad.servicio.js';

/** El archivo del formulario multipart, o un 400 que dice qué falta. */
export function logoDe(req: Parameters<RequestHandler>[0]): ArchivoDeLogo {
  if (!req.file) {
    throw new ErrorAplicacion(400, 'VALIDACION', 'Adjunta la imagen del logo', {
      detalles: [{ campo: 'archivo', mensaje: 'Adjunta la imagen del logo' }],
    });
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

  rutas.put('/logo', exigir('GESTIONAR_IDENTIDAD'), recibirArchivo, async (req, res) => {
    const actor = actorDe(req);
    res.json(await servicio.cambiarLogo(actor, empresaDe(actor), autorDe(actor.autenticacion.usuario), logoDe(req)));
  });

  rutas.delete('/logo', exigir('GESTIONAR_IDENTIDAD'), async (req, res) => {
    const actor = actorDe(req);
    res.json(await servicio.quitarLogo(actor, empresaDe(actor), autorDe(actor.autenticacion.usuario)));
  });

  return rutas;
}
