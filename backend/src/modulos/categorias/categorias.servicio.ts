import { calcularCambios, valoresNuevos } from '../../compartido/cambios.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import { empresaDe, type Actor } from '../../compartido/peticion.js';
import { tienePermiso } from '../../compartido/permisos.js';
import { violaRestriccion } from '../../db/errores-postgres.js';
import { autorDe, denegarAcceso, registrarAccion } from '../historial/historial.registro.js';
import type { CambiosCategoria, NuevaCategoria } from './categorias.esquemas.js';
import {
  actualizarCategoria, buscarCategoria, insertarCategoria, listarCategorias, type Categoria,
} from './categorias.repositorio.js';

const nombreRepetido = () =>
  new ErrorAplicacion(409, 'CATEGORIA_DUPLICADA', 'Ya hay una categoría con ese nombre en tu empresa');

export type ServicioCategorias = ReturnType<typeof crearServicioCategorias>;

/** Todo pasa por el acceso del actor (D17): el filtro por empresa de cada consulta tiene detrás la RLS. */
export function crearServicioCategorias() {
  return {
    /** Las activas, para cualquiera; también las inactivas, solo para quien puede verlas. */
    async listar(actor: Actor, { incluirInactivas }: { incluirInactivas: boolean }): Promise<Categoria[]> {
      const { usuario } = actor.autenticacion;
      if (incluirInactivas && !tienePermiso(usuario.rol, 'VER_CATEGORIAS_INACTIVAS')) {
        throw await denegarAcceso(actor, 'VER_CATEGORIAS_INACTIVAS', { detalle: { operacion: 'LISTAR_CATEGORIAS' } });
      }
      return actor.datos.ejecutar((db) => listarCategorias(db, empresaDe(actor), incluirInactivas));
    },

    async crear(actor: Actor, datos: NuevaCategoria): Promise<Categoria> {
      const { usuario } = actor.autenticacion;
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          const categoria = await insertarCategoria(cliente, empresaDe(actor), datos);
          await registrarAccion(cliente, {
            accion: 'CATEGORIA_CREADA',
            autor: autorDe(usuario),
            contexto: actor.contexto,
            entidad: { tipo: 'categoria', id: categoria.id },
            detalle: { nombre: categoria.nombre },
          });
          return categoria;
        });
      } catch (error) {
        if (violaRestriccion(error, 'categorias_nombre_unico')) throw nombreRepetido();
        throw error;
      }
    },

    async editar(actor: Actor, id: string, propuesta: CambiosCategoria): Promise<Categoria> {
      const { usuario } = actor.autenticacion;
      const empresaId = empresaDe(actor);
      const actual = await actor.datos.ejecutar((db) => buscarCategoria(db, empresaId, id));
      if (!actual) throw noEncontrado('La categoría no existe');
      const cambios = calcularCambios(actual, propuesta);
      if (Object.keys(cambios).length === 0) return actual;
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          await actualizarCategoria(cliente, empresaId, id, valoresNuevos(cambios));
          await registrarAccion(cliente, {
            accion: 'CATEGORIA_EDITADA',
            autor: autorDe(usuario),
            contexto: actor.contexto,
            entidad: { tipo: 'categoria', id },
            detalle: { cambios },
          });
          return { ...actual, ...valoresNuevos(cambios) } as Categoria;
        });
      } catch (error) {
        if (violaRestriccion(error, 'categorias_nombre_unico')) throw nombreRepetido();
        throw error;
      }
    },
  };
}
