import type pg from 'pg';

/**
 * Ejecuta `trabajo` dentro de una transacción: si termina, confirma; si lanza, deshace y relanza
 * el mismo error. Todo lo que deba confirmarse junto —una operación y su registro en el historial
 * (D7)— tiene que usar el cliente que recibe `trabajo`, no el pool.
 */
export async function conTransaccion<T>(
  pool: pg.Pool,
  trabajo: (cliente: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const cliente = await pool.connect();
  let conexionDanada: Error | undefined;
  try {
    await cliente.query('BEGIN');
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK').catch((errorAlDeshacer: Error) => {
      conexionDanada = errorAlDeshacer;
    });
    throw error;
  } finally {
    // Si ni siquiera se pudo deshacer, la conexión está en un estado desconocido:
    // se descarta en vez de devolverla al pool.
    cliente.release(conexionDanada);
  }
}
