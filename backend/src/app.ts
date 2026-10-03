import cors from 'cors';
import express from 'express';
import type pg from 'pg';
import type { Almacenamiento } from './almacenamiento/almacenamiento.js';
import { AlmacenamientoEnDisco } from './almacenamiento/en-disco.js';
import { crearFirmador } from './compartido/tokens.js';
import type { Entorno } from './config/entorno.js';
import type { Correo } from './correo/correo.js';
import { crearAutenticar } from './middlewares/autenticar.js';
import { crearPuertas, exigir } from './middlewares/autorizar.js';
import { contexto } from './middlewares/contexto.js';
import { crearLimitadores } from './middlewares/limitar-intentos.js';
import { manejarErrores, rutaNoEncontrada } from './middlewares/manejar-errores.js';
import { crearControladorAuth } from './modulos/auth/auth.controlador.js';
import { crearRutasAuth } from './modulos/auth/auth.rutas.js';
import { crearServicioAuth } from './modulos/auth/auth.servicio.js';
import { crearControladorCategorias } from './modulos/categorias/categorias.controlador.js';
import { crearRutasCategorias } from './modulos/categorias/categorias.rutas.js';
import { crearServicioCategorias } from './modulos/categorias/categorias.servicio.js';
import { crearControladorDocumentos } from './modulos/documentos/documentos.controlador.js';
import { crearRutasDocumentos } from './modulos/documentos/documentos.rutas.js';
import { crearServicioDocumentos } from './modulos/documentos/documentos.servicio.js';
import { crearRutasHistorial, crearServicioHistorial } from './modulos/historial/historial.consulta.js';
import { crearRutasNotificaciones } from './modulos/notificaciones/notificaciones.rutas.js';
import { crearRutasPlataforma } from './modulos/plataforma/plataforma.rutas.js';
import { crearServicioPlataforma } from './modulos/plataforma/plataforma.servicio.js';
import { crearRutasSalud } from './modulos/salud/salud.rutas.js';
import { crearRutasSolicitudes } from './modulos/solicitudes/solicitudes.rutas.js';
import { crearServicioSolicitudes } from './modulos/solicitudes/solicitudes.servicio.js';
import { crearRutasTiempos } from './modulos/tiempos-respuesta/tiempos-respuesta.rutas.js';
import { crearServicioTiempos } from './modulos/tiempos-respuesta/tiempos-respuesta.servicio.js';
import { crearControladorUsuarios } from './modulos/usuarios/usuarios.controlador.js';
import { crearRutasUsuarios } from './modulos/usuarios/usuarios.rutas.js';
import { crearServicioUsuarios } from './modulos/usuarios/usuarios.servicio.js';

export interface Dependencias {
  pool: pg.Pool;
  entorno: Entorno;
  almacenamiento: Almacenamiento;
  correo: Correo;
}

/** Ensambla la API sin ponerla a escuchar: así las pruebas la usan con su propia base. */
export function crearApp({ pool, entorno, almacenamiento, correo }: Dependencias): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', entorno.PROXIES_DE_CONFIANZA);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(cors({
    origin: entorno.CORS_ORIGEN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Sin esto, el navegador oculta la cabecera a la SPA (otro origen) y el CSV no llega con su nombre.
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(contexto);

  const firmador = crearFirmador(entorno.JWT_SECRETO);
  const autenticar = crearAutenticar(pool, firmador);
  // Ningún módulo de negocio recibe el pool: solo el acceso que la autenticación crea para cada petición.
  const { empresa, plataforma } = crearPuertas(autenticar);
  const tiempos = crearServicioTiempos();
  const servicioAuth = crearServicioAuth({
    pool,
    firmador,
    duracionHoras: entorno.JWT_DURACION_HORAS,
    correo,
    urlFrontend: entorno.URL_FRONTEND,
  });
  const servicioDocumentos = crearServicioDocumentos({ almacenamiento });

  app.use('/api/v1/salud', crearRutasSalud(pool, { diagnosticoRed: entorno.DIAGNOSTICO_RED }));
  app.use('/api/v1/auth', crearRutasAuth(crearControladorAuth(servicioAuth), autenticar, crearLimitadores()));
  app.use('/api/v1/plataforma', crearRutasPlataforma(crearServicioPlataforma(), plataforma));
  app.use('/api/v1/categorias', crearRutasCategorias(crearControladorCategorias(crearServicioCategorias()), empresa, exigir));
  app.use('/api/v1/usuarios', crearRutasUsuarios(crearControladorUsuarios(crearServicioUsuarios()), empresa, exigir));
  // Antes que /documentos: una de sus rutas es /documentos/:id/solicitudes, y así no se autentica dos veces.
  app.use('/api/v1', crearRutasSolicitudes(crearServicioSolicitudes(), empresa, exigir));
  app.use('/api/v1/documentos', crearRutasDocumentos(crearControladorDocumentos(servicioDocumentos, tiempos), empresa));
  app.use('/api/v1/notificaciones', crearRutasNotificaciones(empresa));
  app.use('/api/v1/historial', crearRutasHistorial(crearServicioHistorial(), empresa, exigir));
  app.use('/api/v1/tiempos-respuesta', crearRutasTiempos(tiempos, empresa));
  if (almacenamiento instanceof AlmacenamientoEnDisco) app.use('/api/v1/archivos', almacenamiento.rutas());

  app.use(rutaNoEncontrada);
  app.use(manejarErrores);
  return app;
}
