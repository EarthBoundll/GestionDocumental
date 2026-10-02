import type pg from 'pg';
import { noEncontrado } from '../../compartido/errores.js';
import type { Actor } from '../../compartido/peticion.js';

export interface Medicion {
  usuarioId: string;
  conFiltros: boolean;
  totalResultados: number;
  duracionServidorMs: number;
  esMovil: boolean;
}

export type ServicioTiempos = ReturnType<typeof crearServicioTiempos>;

/** El indicador 7: cuánto tarda el listado de documentos, en el servidor y para la persona que espera. */
export function crearServicioTiempos(pool: pg.Pool) {
  return {
    /**
     * Guarda la parte del servidor y devuelve el id con el que el navegador completará la suya. Si no
     * se puede guardar, el listado se entrega igual: una medición perdida no justifica dejar sin datos
     * a quien busca un documento, y medir no es una acción auditable.
     */
    async registrar(medicion: Medicion): Promise<string | null> {
      try {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO tiempos_respuesta (usuario_id, operacion, con_filtros, total_resultados, duracion_servidor_ms, es_movil)
           VALUES ($1, 'LISTAR_DOCUMENTOS', $2, $3, $4, $5) RETURNING id`,
          [medicion.usuarioId, medicion.conFiltros, medicion.totalResultados, Math.round(medicion.duracionServidorMs), medicion.esMovil],
        );
        return rows[0]?.id ?? null;
      } catch (error) {
        console.error('[tiempos] no se pudo guardar una medición:', error);
        return null;
      }
    },

    /** La parte del navegador: una vez por medición, y solo quien la originó. */
    async completar(actor: Actor, id: string, duracionClienteMs: number): Promise<void> {
      const { rowCount } = await pool.query(
        `UPDATE tiempos_respuesta SET duracion_cliente_ms = $3
         WHERE id = $1 AND usuario_id = $2 AND duracion_cliente_ms IS NULL`,
        [id, actor.autenticacion.usuario.id, Math.round(duracionClienteMs)],
      );
      if (rowCount === 0) throw noEncontrado('La medición no existe o ya está completa');
    },
  };
}
