import { noEncontrado } from '../../compartido/errores.js';
import { empresaDe, type Actor } from '../../compartido/peticion.js';

export interface Medicion {
  conFiltros: boolean;
  totalResultados: number;
  duracionServidorMs: number;
  esMovil: boolean;
}

export type ServicioTiempos = ReturnType<typeof crearServicioTiempos>;

/** El indicador 7: cuánto tarda el listado de documentos, en el servidor y para la persona que espera. */
export function crearServicioTiempos() {
  return {
    /**
     * Guarda la parte del servidor y devuelve el id con el que el navegador completará la suya. Si no
     * se puede guardar, el listado se entrega igual: una medición perdida no justifica dejar sin datos
     * a quien busca un documento, y medir no es una acción auditable.
     */
    async registrar(actor: Actor, medicion: Medicion): Promise<string | null> {
      try {
        const { rows } = await actor.datos.ejecutar((db) => db.query<{ id: string }>(
          `INSERT INTO tiempos_respuesta (empresa_id, usuario_id, operacion, con_filtros, total_resultados, duracion_servidor_ms, es_movil)
           VALUES ($1, $2, 'LISTAR_DOCUMENTOS', $3, $4, $5, $6) RETURNING id`,
          [empresaDe(actor), actor.autenticacion.usuario.id, medicion.conFiltros, medicion.totalResultados, Math.round(medicion.duracionServidorMs), medicion.esMovil],
        ));
        return rows[0]?.id ?? null;
      } catch (error) {
        console.error('[tiempos] no se pudo guardar una medición:', error);
        return null;
      }
    },

    /** La parte del navegador: una vez por medición, y solo quien la originó. */
    async completar(actor: Actor, id: string, duracionClienteMs: number): Promise<void> {
      const { rowCount } = await actor.datos.ejecutar((db) => db.query(
        `UPDATE tiempos_respuesta SET duracion_cliente_ms = $4
         WHERE empresa_id = $1 AND id = $2 AND usuario_id = $3 AND duracion_cliente_ms IS NULL`,
        [empresaDe(actor), id, actor.autenticacion.usuario.id, Math.round(duracionClienteMs)],
      ));
      if (rowCount === 0) throw noEncontrado('La medición no existe o ya está completa');
    },
  };
}
