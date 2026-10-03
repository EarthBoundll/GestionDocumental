import { calcularCambios, valoresNuevos } from '../../compartido/cambios.js';
import { hashearClave } from '../../compartido/claves.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import type { Actor } from '../../compartido/peticion.js';
import { violaRestriccion } from '../../db/errores-postgres.js';
import { revocarSesionesDe } from '../auth/auth.repositorio.js';
import { CATEGORIAS_INICIALES } from '../categorias/categorias.iniciales.js';
import { autorDelMasterSobre, registrarAccion } from '../historial/historial.registro.js';
import { cambiosParaElHistorial, correoEnUso } from '../usuarios/usuarios.servicio.js';
import type {
  CambiosAdministrador, CambiosEmpresa, NuevaEmpresa, NuevoAdministrador,
} from './plataforma.esquemas.js';
import {
  actualizarAdministrador, actualizarEmpresa, buscarAdministrador, buscarEmpresa, insertarAdministrador,
  insertarCategoriasIniciales, insertarEmpresa, listarAdministradores, listarEmpresas, metricasGlobales,
  revocarSesionesDeEmpresa, type Administrador, type Empresa, type EmpresaConMetricas,
} from './plataforma.repositorio.js';

export type ServicioPlataforma = ReturnType<typeof crearServicioPlataforma>;

const rucEnUso = () => new ErrorAplicacion(409, 'RUC_EN_USO', 'Ya hay una empresa registrada con ese RUC');

/** Traduce las restricciones de unicidad de la base a errores que se le pueden mostrar al Master. */
function traducir(error: unknown): unknown {
  if (violaRestriccion(error, 'usuarios_email_unico')) return correoEnUso();
  if (violaRestriccion(error, 'empresas_ruc_unico')) return rucEnUso();
  return error;
}

/**
 * Lo que hace el Administrador Master (CLAUDE.md v2): crea empresas con su primer administrador, las
 * edita, las desactiva y ve sus cifras. Solo llega aquí quien tiene GESTIONAR_PLATAFORMA, y su acceso
 * a los datos es el de plataforma: la base no le deja leer el contenido de ninguna empresa.
 */
export function crearServicioPlataforma() {
  async function empresaExistente(actor: Actor, id: string): Promise<EmpresaConMetricas> {
    const empresa = await actor.datos.ejecutar((db) => buscarEmpresa(db, id));
    if (!empresa) throw noEncontrado('La empresa no existe');
    return empresa;
  }

  async function administradorExistente(actor: Actor, id: string): Promise<Administrador> {
    const administrador = await actor.datos.ejecutar((db) => buscarAdministrador(db, id));
    if (!administrador) throw noEncontrado('El administrador no existe');
    return administrador;
  }

  return {
    metricas: (actor: Actor) => actor.datos.ejecutar((db) => metricasGlobales(db)),

    listarEmpresas: (actor: Actor) => actor.datos.ejecutar((db) => listarEmpresas(db)),

    async obtenerEmpresa(actor: Actor, id: string): Promise<EmpresaConMetricas & { administradores: Administrador[] }> {
      const empresa = await empresaExistente(actor, id);
      const administradores = await actor.datos.ejecutar((db) => listarAdministradores(db, id));
      return { ...empresa, administradores };
    },

    /** La empresa, su primer administrador y sus categorías iniciales (RN07), todo o nada. */
    async crearEmpresa(actor: Actor, { empresa: datosEmpresa, administrador: datosAdministrador }: NuevaEmpresa) {
      const master = actor.autenticacion.usuario;
      // Fuera de la transacción: es lo más lento y no toca la base.
      const claveHash = await hashearClave(datosAdministrador.clave);
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          const empresa = await insertarEmpresa(cliente, { nombre: datosEmpresa.nombre, ruc: datosEmpresa.ruc ?? null });
          const administrador = await insertarAdministrador(cliente, {
            empresaId: empresa.id,
            nombre: datosAdministrador.nombre,
            email: datosAdministrador.email,
            dni: datosAdministrador.dni ?? null,
            claveHash,
          });
          await insertarCategoriasIniciales(cliente, empresa.id, CATEGORIAS_INICIALES);
          const autor = autorDelMasterSobre(master, empresa.id);
          await registrarAccion(cliente, {
            accion: 'EMPRESA_CREADA', autor, contexto: actor.contexto,
            entidad: { tipo: 'empresa', id: empresa.id }, detalle: { nombre: empresa.nombre, ruc: empresa.ruc },
          });
          await registrarAccion(cliente, {
            accion: 'USUARIO_CREADO', autor, contexto: actor.contexto,
            entidad: { tipo: 'usuario', id: administrador.id },
            detalle: { nombre: administrador.nombre, email: administrador.email, rol: 'administrador' },
          });
          return { empresa, administrador };
        });
      } catch (error) {
        throw traducir(error);
      }
    },

    async editarEmpresa(actor: Actor, id: string, propuesta: CambiosEmpresa): Promise<Empresa> {
      const actual = await empresaExistente(actor, id);
      const cambios = calcularCambios(actual, propuesta);
      if (Object.keys(cambios).length === 0) return actual;
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          await actualizarEmpresa(cliente, id, valoresNuevos(cambios));
          await registrarAccion(cliente, {
            accion: 'EMPRESA_EDITADA', autor: autorDelMasterSobre(actor.autenticacion.usuario, id), contexto: actor.contexto,
            entidad: { tipo: 'empresa', id }, detalle: { cambios },
          });
          return { ...actual, ...valoresNuevos(cambios) } as EmpresaConMetricas;
        });
      } catch (error) {
        throw traducir(error);
      }
    },

    /** Desactivar una empresa la deja fuera en ese momento: se cierran las sesiones de todos sus usuarios. */
    async cambiarEstadoEmpresa(actor: Actor, id: string, activa: boolean): Promise<Empresa> {
      const actual = await empresaExistente(actor, id);
      if (actual.activa === activa) return actual;
      return actor.datos.ejecutar(async (cliente) => {
        await actualizarEmpresa(cliente, id, { activa });
        const sesionesCerradas = activa ? 0 : await revocarSesionesDeEmpresa(cliente, id);
        await registrarAccion(cliente, {
          accion: activa ? 'EMPRESA_REACTIVADA' : 'EMPRESA_DESACTIVADA',
          autor: autorDelMasterSobre(actor.autenticacion.usuario, id), contexto: actor.contexto,
          entidad: { tipo: 'empresa', id }, detalle: { nombre: actual.nombre, sesionesCerradas },
        });
        return { ...actual, activa };
      });
    },

    async crearAdministrador(actor: Actor, empresaId: string, datos: NuevoAdministrador): Promise<Administrador> {
      await empresaExistente(actor, empresaId);
      const claveHash = await hashearClave(datos.clave);
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          const administrador = await insertarAdministrador(cliente, {
            empresaId, nombre: datos.nombre, email: datos.email, dni: datos.dni ?? null, claveHash,
          });
          await registrarAccion(cliente, {
            accion: 'USUARIO_CREADO', autor: autorDelMasterSobre(actor.autenticacion.usuario, empresaId), contexto: actor.contexto,
            entidad: { tipo: 'usuario', id: administrador.id },
            detalle: { nombre: administrador.nombre, email: administrador.email, rol: 'administrador' },
          });
          return administrador;
        });
      } catch (error) {
        throw traducir(error);
      }
    },

    async editarAdministrador(actor: Actor, id: string, { clave, ...propuesta }: CambiosAdministrador): Promise<Administrador> {
      const actual = await administradorExistente(actor, id);
      const cambios = calcularCambios(actual, propuesta);
      if (Object.keys(cambios).length === 0 && clave === undefined) return actual;
      const claveHash = clave === undefined ? undefined : await hashearClave(clave);
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          await actualizarAdministrador(cliente, id, { ...valoresNuevos(cambios), ...(claveHash && { claveHash }) });
          // Una contraseña restablecida es porque la anterior ya no es de fiar: sus sesiones se cierran.
          const sesionesCerradas = claveHash ? await revocarSesionesDe(cliente, id) : 0;
          await registrarAccion(cliente, {
            accion: 'USUARIO_EDITADO',
            autor: autorDelMasterSobre(actor.autenticacion.usuario, actual.empresaId), contexto: actor.contexto,
            entidad: { tipo: 'usuario', id },
            detalle: { cambios: cambiosParaElHistorial(cambios), ...(claveHash && { claveRestablecida: true, sesionesCerradas }) },
          });
          return { ...actual, ...valoresNuevos(cambios) } as Administrador;
        });
      } catch (error) {
        throw traducir(error);
      }
    },

    async cambiarEstadoAdministrador(actor: Actor, id: string, activo: boolean): Promise<Administrador> {
      const actual = await administradorExistente(actor, id);
      if (actual.activo === activo) return actual;
      return actor.datos.ejecutar(async (cliente) => {
        await actualizarAdministrador(cliente, id, { activo });
        const sesionesCerradas = activo ? 0 : await revocarSesionesDe(cliente, id);
        await registrarAccion(cliente, {
          accion: activo ? 'USUARIO_REACTIVADO' : 'USUARIO_DESACTIVADO',
          autor: autorDelMasterSobre(actor.autenticacion.usuario, actual.empresaId), contexto: actor.contexto,
          entidad: { tipo: 'usuario', id }, detalle: { nombre: actual.nombre, sesionesCerradas },
        });
        return { ...actual, activo };
      });
    },
  };
}
