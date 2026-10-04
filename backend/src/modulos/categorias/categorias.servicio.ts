import { calcularCambios, valoresNuevos } from '../../compartido/cambios.js';
import { ErrorAplicacion, noEncontrado } from '../../compartido/errores.js';
import { empresaDe, type Actor } from '../../compartido/peticion.js';
import { tienePermiso } from '../../compartido/permisos.js';
import { violaRestriccion } from '../../db/errores-postgres.js';
import { autorDe, denegarAcceso, registrarAccion } from '../historial/historial.registro.js';
import type { CambiosCategoria, NuevaCategoria } from './categorias.esquemas.js';
import type { Consultor } from '../../db/pool.js';
import {
  actualizarCategoria, agregarAccesos, buscarCategoria, insertarCategoria, listarCategorias, quitarAccesos, type Categoria,
} from './categorias.repositorio.js';

const nombreRepetido = () =>
  new ErrorAplicacion(409, 'CATEGORIA_DUPLICADA', 'Ya hay una categoría con ese nombre en tu empresa');

const usuarioAjeno = () => new ErrorAplicacion(400, 'VALIDACION', 'Revisa los datos enviados', {
  detalles: [{ campo: 'usuariosAutorizados', mensaje: 'Alguna de las personas no pertenece a tu empresa' }],
});

/** Traduce lo que la base rechaza al guardar una categoría en un error que se le puede mostrar a la persona. */
function traducirError(error: unknown): never {
  if (violaRestriccion(error, 'categorias_nombre_unico')) throw nombreRepetido();
  if (violaRestriccion(error, 'categoria_accesos_usuario_de_su_empresa')) throw usuarioAjeno();
  throw error;
}

/** Los nombres de unas personas, para que el historial se lea sin buscar identificadores. */
async function nombresDe(db: Consultor, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<{ nombre: string }>('SELECT nombre FROM usuarios WHERE id = ANY($1::uuid[]) ORDER BY nombre', [ids]);
  return rows.map((fila) => fila.nombre);
}

const diferencia = (a: string[], b: string[]) => a.filter((id) => !b.includes(id));

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

    async crear(actor: Actor, { usuariosAutorizados, ...datos }: NuevaCategoria): Promise<Categoria> {
      const { usuario } = actor.autenticacion;
      const empresaId = empresaDe(actor);
      // Una lista de personas solo tiene sentido en una categoría restringida.
      const autorizados = datos.restringida ? (usuariosAutorizados ?? []) : [];
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          const { id } = await insertarCategoria(cliente, empresaId, datos);
          await agregarAccesos(cliente, empresaId, id, autorizados);
          const categoria = (await buscarCategoria(cliente, empresaId, id))!;
          await registrarAccion(cliente, {
            accion: 'CATEGORIA_CREADA',
            autor: autorDe(usuario),
            contexto: actor.contexto,
            entidad: { tipo: 'categoria', id },
            detalle: {
              nombre: categoria.nombre,
              ...(categoria.restringida && { restringida: true, autorizados: await nombresDe(cliente, autorizados) }),
            },
          });
          return categoria;
        });
      } catch (error) {
        traducirError(error);
      }
    },

    async editar(actor: Actor, id: string, { usuariosAutorizados, ...propuesta }: CambiosCategoria): Promise<Categoria> {
      const { usuario } = actor.autenticacion;
      const empresaId = empresaDe(actor);
      const actual = await actor.datos.ejecutar((db) => buscarCategoria(db, empresaId, id));
      if (!actual) throw noEncontrado('La categoría no existe');
      const cambios = calcularCambios(actual, propuesta);
      // Al abrir una categoría se quitan sus accesos: si se vuelve a restringir, se empieza de cero.
      const restringida = propuesta.restringida ?? actual.restringida;
      const objetivo = restringida ? (usuariosAutorizados ?? actual.usuariosAutorizados) : [];
      const anadidos = diferencia(objetivo, actual.usuariosAutorizados);
      const quitados = diferencia(actual.usuariosAutorizados, objetivo);
      if (Object.keys(cambios).length === 0 && anadidos.length === 0 && quitados.length === 0) return actual;
      try {
        return await actor.datos.ejecutar(async (cliente) => {
          if (Object.keys(cambios).length > 0) await actualizarCategoria(cliente, empresaId, id, valoresNuevos(cambios));
          await agregarAccesos(cliente, empresaId, id, anadidos);
          await quitarAccesos(cliente, empresaId, id, quitados);
          const accesos = anadidos.length + quitados.length > 0
            ? { accesos: { anadidos: await nombresDe(cliente, anadidos), quitados: await nombresDe(cliente, quitados) } }
            : {};
          await registrarAccion(cliente, {
            accion: 'CATEGORIA_EDITADA',
            autor: autorDe(usuario),
            contexto: actor.contexto,
            entidad: { tipo: 'categoria', id },
            detalle: { cambios, ...accesos },
          });
          return (await buscarCategoria(cliente, empresaId, id))!;
        });
      } catch (error) {
        traducirError(error);
      }
    },
  };
}
