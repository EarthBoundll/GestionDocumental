import type { Consultor } from '../../src/db/pool.js';

// Datos mínimos para probar las reglas de la base. Cada llamada crea filas nuevas y distintas.

let secuencia = 0;
const siguiente = () => ++secuencia;

const HASH_DE_EJEMPLO = '$2b$10$' + 'x'.repeat(53);

async function insertar(db: Consultor, sql: string, valores: unknown[]): Promise<string> {
  const { rows } = await db.query<{ id: string }>(sql, valores);
  const fila = rows[0];
  if (!fila) throw new Error('La inserción no devolvió ninguna fila');
  return fila.id;
}

export function crearEmpresa(db: Consultor): Promise<string> {
  return insertar(db, 'INSERT INTO empresas (nombre) VALUES ($1) RETURNING id', [`Empresa ${siguiente()}`]);
}

export function crearUsuario(
  db: Consultor,
  empresaId: string,
  rol: 'administrador' | 'usuario' = 'usuario',
): Promise<string> {
  const n = siguiente();
  return insertar(
    db,
    `INSERT INTO usuarios (empresa_id, nombre, email, clave_hash, rol)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [empresaId, `Persona ${n}`, `persona${n}@ejemplo.pe`, HASH_DE_EJEMPLO, rol],
  );
}

export function crearCategoria(db: Consultor, empresaId: string, nombre = `Categoría ${siguiente()}`): Promise<string> {
  return insertar(db, 'INSERT INTO categorias (empresa_id, nombre) VALUES ($1, $2) RETURNING id', [empresaId, nombre]);
}

export function crearDocumento(
  db: Consultor,
  datos: { empresaId: string; categoriaId: string; subidoPor: string; nombre?: string; pesoBytes?: number },
): Promise<string> {
  const n = siguiente();
  return insertar(
    db,
    `INSERT INTO documentos (empresa_id, categoria_id, subido_por, nombre, fecha_documento,
       archivo_nombre_original, archivo_ruta, archivo_tipo_mime, archivo_peso_bytes)
     VALUES ($1, $2, $3, $4, '2026-09-15', 'archivo.pdf', $5, 'application/pdf', $6) RETURNING id`,
    [datos.empresaId, datos.categoriaId, datos.subidoPor, datos.nombre ?? `Documento ${n}`,
      `${datos.empresaId}/${n}.pdf`, datos.pesoBytes ?? 1024],
  );
}

export function crearSolicitud(
  db: Consultor,
  datos: { empresaId: string; documentoId: string; solicitanteId: string },
): Promise<string> {
  return insertar(
    db,
    'INSERT INTO solicitudes (empresa_id, documento_id, solicitante_id) VALUES ($1, $2, $3) RETURNING id',
    [datos.empresaId, datos.documentoId, datos.solicitanteId],
  );
}

/** Una empresa con un administrador, un usuario, una categoría y un documento del usuario. */
export async function crearEscenario(db: Consultor) {
  const empresaId = await crearEmpresa(db);
  const administradorId = await crearUsuario(db, empresaId, 'administrador');
  const usuarioId = await crearUsuario(db, empresaId, 'usuario');
  const categoriaId = await crearCategoria(db, empresaId);
  const documentoId = await crearDocumento(db, { empresaId, categoriaId, subidoPor: usuarioId });
  return { empresaId, administradorId, usuarioId, categoriaId, documentoId };
}
