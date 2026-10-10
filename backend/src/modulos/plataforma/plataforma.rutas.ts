import { Router, type RequestHandler } from 'express';
import { actorDe, idDeRuta } from '../../compartido/peticion.js';
import { recibirArchivo } from '../../middlewares/recibir-archivo.js';
import { autorDelMasterSobre } from '../historial/historial.registro.js';
import { esquemaIdentidad } from '../identidad/identidad.esquemas.js';
import { imagenDe, IMAGENES_DE_IDENTIDAD } from '../identidad/identidad.rutas.js';
import type { ServicioIdentidad } from '../identidad/identidad.servicio.js';
import {
  esquemaCambiosAdministrador, esquemaCambiosEmpresa, esquemaEstadoAdministrador, esquemaEstadoEmpresa,
  esquemaNuevaEmpresa, esquemaNuevoAdministrador,
} from './plataforma.esquemas.js';
import type { ServicioPlataforma } from './plataforma.servicio.js';

/** El área del Master. Todas sus rutas entran por la puerta de plataforma. */
export function crearRutasPlataforma(
  servicio: ServicioPlataforma,
  entrar: RequestHandler,
  { historial, respaldos, identidad }: { historial: Router; respaldos: Router; identidad: ServicioIdentidad },
): Router {
  const rutas = Router();
  rutas.use(entrar);
  rutas.use('/historial', historial);
  rutas.use('/respaldos', respaldos);

  rutas.get('/metricas', async (req, res) => {
    res.json(await servicio.metricas(actorDe(req)));
  });

  rutas.get('/empresas', async (req, res) => {
    res.json({ datos: await servicio.listarEmpresas(actorDe(req)) });
  });

  rutas.post('/empresas', async (req, res) => {
    const datos = esquemaNuevaEmpresa.parse(req.body);
    res.status(201).json(await servicio.crearEmpresa(actorDe(req), datos));
  });

  rutas.get('/empresas/:id', async (req, res) => {
    const actor = actorDe(req);
    const id = idDeRuta(req);
    const empresa = await servicio.obtenerEmpresa(actor, id);
    res.json({ ...empresa, marca: await identidad.obtener(actor, id) });
  });

  // RF31: el Master también da identidad a una empresa, con su acceso y quedando como autor (D18).
  rutas.patch('/empresas/:id/identidad', async (req, res) => {
    const actor = actorDe(req);
    const id = idDeRuta(req);
    const cambios = esquemaIdentidad.parse(req.body);
    res.json(await identidad.editar(actor, id, autorDelMasterSobre(actor.autenticacion.usuario, id), cambios));
  });

  for (const imagen of IMAGENES_DE_IDENTIDAD) {
    rutas.put(`/empresas/:id/identidad/${imagen}`, recibirArchivo, async (req, res) => {
      const actor = actorDe(req);
      const id = idDeRuta(req);
      res.json(await identidad.cambiarImagen(actor, id, autorDelMasterSobre(actor.autenticacion.usuario, id), imagen, imagenDe(req, imagen)));
    });

    rutas.delete(`/empresas/:id/identidad/${imagen}`, async (req, res) => {
      const actor = actorDe(req);
      const id = idDeRuta(req);
      res.json(await identidad.quitarImagen(actor, id, autorDelMasterSobre(actor.autenticacion.usuario, id), imagen));
    });
  }

  rutas.patch('/empresas/:id', async (req, res) => {
    const id = idDeRuta(req);
    res.json(await servicio.editarEmpresa(actorDe(req), id, esquemaCambiosEmpresa.parse(req.body)));
  });

  rutas.patch('/empresas/:id/estado', async (req, res) => {
    const id = idDeRuta(req);
    const { activa } = esquemaEstadoEmpresa.parse(req.body);
    res.json(await servicio.cambiarEstadoEmpresa(actorDe(req), id, activa));
  });

  rutas.post('/empresas/:id/administradores', async (req, res) => {
    const id = idDeRuta(req);
    res.status(201).json(await servicio.crearAdministrador(actorDe(req), id, esquemaNuevoAdministrador.parse(req.body)));
  });

  rutas.patch('/administradores/:id', async (req, res) => {
    const id = idDeRuta(req);
    res.json(await servicio.editarAdministrador(actorDe(req), id, esquemaCambiosAdministrador.parse(req.body)));
  });

  // D41: otra invitación (o verificación) para un administrador que no la recibió o la dejó caducar.
  rutas.post('/administradores/:id/invitacion', async (req, res) => {
    res.json(await servicio.reenviarInvitacion(actorDe(req), idDeRuta(req)));
  });

  rutas.patch('/administradores/:id/estado', async (req, res) => {
    const id = idDeRuta(req);
    const { activo } = esquemaEstadoAdministrador.parse(req.body);
    res.json(await servicio.cambiarEstadoAdministrador(actorDe(req), id, activo));
  });

  return rutas;
}
