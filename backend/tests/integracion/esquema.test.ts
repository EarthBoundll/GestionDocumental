import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearBaseDePruebas, type BaseDePruebas } from '../apoyo/base-de-pruebas.js';
import {
  crearCategoria, crearDocumento, crearEscenario, crearEmpresa, crearSolicitud, crearUsuario,
} from '../apoyo/datos.js';

// Códigos de error de PostgreSQL.
const CLAVE_FORANEA = '23503';
const UNICIDAD = '23505';
const COMPROBACION = '23514';

const ACCIONES_DEL_CATALOGO = [
  'SESION_INICIADA', 'SESION_FALLIDA', 'SESION_CERRADA', 'CLAVE_CAMBIADA', 'RECUPERACION_SOLICITADA',
  'CLAVE_RESTABLECIDA', 'EMPRESA_CREADA', 'EMPRESA_EDITADA', 'EMPRESA_DESACTIVADA', 'EMPRESA_REACTIVADA',
  'USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_DESACTIVADO', 'USUARIO_REACTIVADO', 'CATEGORIA_CREADA',
  'CATEGORIA_EDITADA', 'DOCUMENTO_SUBIDO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_ELIMINADO', 'DOCUMENTO_VISUALIZADO',
  'DOCUMENTO_DESCARGADO', 'BUSQUEDA_REALIZADA', 'SOLICITUD_CREADA', 'SOLICITUD_APROBADA',
  'SOLICITUD_RECHAZADA', 'ACCESO_DENEGADO', 'HISTORIAL_EXPORTADO',
  'DOCUMENTO_RESTAURADO', 'DOCUMENTO_PURGADO', 'RESPALDO_GENERADO',
];

describe('Reglas que impone la propia base (docs/03-modelo-datos.md §3)', () => {
  let base: BaseDePruebas;
  let db: pg.Pool;

  beforeAll(async () => {
    base = await crearBaseDePruebas();
    db = base.pool;
  });
  afterAll(() => base.cerrar());

  describe('aislamiento entre empresas (RN01, M2)', () => {
    it('un documento no puede usar la categoría de otra empresa', async () => {
      const a = await crearEscenario(db);
      const categoriaAjena = await crearCategoria(db, await crearEmpresa(db));

      await expect(
        crearDocumento(db, { empresaId: a.empresaId, categoriaId: categoriaAjena, subidoPor: a.usuarioId }),
      ).rejects.toMatchObject({ code: CLAVE_FORANEA, constraint: 'documentos_categoria_de_su_empresa' });
    });

    it('un documento no puede tener como propietario a alguien de otra empresa', async () => {
      const a = await crearEscenario(db);
      const ajeno = await crearUsuario(db, await crearEmpresa(db));

      await expect(
        crearDocumento(db, { empresaId: a.empresaId, categoriaId: a.categoriaId, subidoPor: ajeno }),
      ).rejects.toMatchObject({ code: CLAVE_FORANEA, constraint: 'documentos_propietario_de_su_empresa' });
    });

    it('una solicitud no la puede resolver un administrador de otra empresa', async () => {
      const a = await crearEscenario(db);
      const solicitudId = await crearSolicitud(db, {
        empresaId: a.empresaId, documentoId: a.documentoId, solicitanteId: a.usuarioId,
      });
      const administradorAjeno = await crearUsuario(db, await crearEmpresa(db), 'administrador');

      await expect(resolver(db, solicitudId, 'aprobada', administradorAjeno))
        .rejects.toMatchObject({ code: CLAVE_FORANEA, constraint: 'solicitudes_revisor_de_su_empresa' });
    });

    it('el historial no puede atribuir a una empresa la acción de alguien de otra', async () => {
      const a = await crearEscenario(db);
      const ajeno = await crearUsuario(db, await crearEmpresa(db));

      await expect(registrar(db, { empresaId: a.empresaId, usuarioId: ajeno, rol: 'usuario' }))
        .rejects.toMatchObject({ code: CLAVE_FORANEA, constraint: 'historial_autor_de_su_empresa' });
    });
  });

  it('el correo se guarda en minúsculas y es único en todo el sistema (RN02)', async () => {
    const primera = await crearEmpresa(db);
    const segunda = await crearEmpresa(db);
    const insertarCorreo = (empresaId: string, email: string) => db.query(
      `INSERT INTO usuarios (empresa_id, nombre, email, clave_hash, rol)
       VALUES ($1, 'Ana', $2, repeat('x', 60), 'usuario')`,
      [empresaId, email],
    );

    await expect(insertarCorreo(primera, 'Ana@Ejemplo.pe'))
      .rejects.toMatchObject({ code: COMPROBACION, constraint: 'usuarios_email_en_minusculas' });
    await insertarCorreo(primera, 'ana@ejemplo.pe');
    await expect(insertarCorreo(segunda, 'ana@ejemplo.pe'))
      .rejects.toMatchObject({ code: UNICIDAD, constraint: 'usuarios_email_unico' });
  });

  it('una categoría no repite nombre en su empresa, sin distinguir mayúsculas (RN08)', async () => {
    const empresaId = await crearEmpresa(db);
    await crearCategoria(db, empresaId, 'Contratos');

    await expect(crearCategoria(db, empresaId, 'CONTRATOS'))
      .rejects.toMatchObject({ code: UNICIDAD, constraint: 'categorias_nombre_unico' });
    // lower() también debe entender las letras con tilde, no solo las del alfabeto inglés.
    await crearCategoria(db, empresaId, 'Área legal');
    await expect(crearCategoria(db, empresaId, 'ÁREA LEGAL'))
      .rejects.toMatchObject({ code: UNICIDAD, constraint: 'categorias_nombre_unico' });
    await expect(crearCategoria(db, await crearEmpresa(db), 'Contratos')).resolves.toBeTypeOf('string');
  });

  it('un archivo pesa como máximo 10 MB (RN09)', async () => {
    const a = await crearEscenario(db);
    const subir = (pesoBytes: number) => crearDocumento(db, {
      empresaId: a.empresaId, categoriaId: a.categoriaId, subidoPor: a.usuarioId, pesoBytes,
    });

    await expect(subir(10 * 1024 * 1024)).resolves.toBeTypeOf('string');
    await expect(subir(10 * 1024 * 1024 + 1))
      .rejects.toMatchObject({ code: COMPROBACION, constraint: 'documentos_peso_maximo' });
  });

  describe('solicitudes de aprobación', () => {
    it('solo puede haber una pendiente por documento, y tras resolverla se puede pedir otra (RN12, RN14)', async () => {
      const a = await crearEscenario(db);
      const datos = { empresaId: a.empresaId, documentoId: a.documentoId, solicitanteId: a.usuarioId };
      const primera = await crearSolicitud(db, datos);

      await expect(crearSolicitud(db, datos))
        .rejects.toMatchObject({ code: UNICIDAD, constraint: 'solicitudes_una_pendiente_por_documento' });
      await resolver(db, primera, 'rechazada', a.administradorId, 'Falta la firma');
      await expect(crearSolicitud(db, datos)).resolves.toBeTypeOf('string');
    });

    it('nadie resuelve su propia solicitud (RN13)', async () => {
      const a = await crearEscenario(db);
      const solicitudId = await crearSolicitud(db, {
        empresaId: a.empresaId, documentoId: a.documentoId, solicitanteId: a.administradorId,
      });

      await expect(resolver(db, solicitudId, 'aprobada', a.administradorId))
        .rejects.toMatchObject({ code: COMPROBACION, constraint: 'solicitudes_sin_autoaprobacion' });
    });

    it('rechazar exige un motivo que no esté en blanco (RN14)', async () => {
      const a = await crearEscenario(db);
      const solicitudId = await crearSolicitud(db, {
        empresaId: a.empresaId, documentoId: a.documentoId, solicitanteId: a.usuarioId,
      });

      for (const motivo of [null, '   ']) {
        await expect(resolver(db, solicitudId, 'rechazada', a.administradorId, motivo))
          .rejects.toMatchObject({ code: COMPROBACION, constraint: 'solicitudes_rechazo_con_motivo' });
      }
      await expect(resolver(db, solicitudId, 'rechazada', a.administradorId, 'Ilegible')).resolves.toBeDefined();
    });

    it('una resuelta tiene revisor y fecha de resolución, y una pendiente no', async () => {
      const a = await crearEscenario(db);
      const solicitudId = await crearSolicitud(db, {
        empresaId: a.empresaId, documentoId: a.documentoId, solicitanteId: a.usuarioId,
      });

      await expect(db.query("UPDATE solicitudes SET estado = 'aprobada' WHERE id = $1", [solicitudId]))
        .rejects.toMatchObject({ code: COMPROBACION, constraint: 'solicitudes_resolucion_coherente' });
      await expect(db.query('UPDATE solicitudes SET revisor_id = $2 WHERE id = $1', [solicitudId, a.administradorId]))
        .rejects.toMatchObject({ code: COMPROBACION, constraint: 'solicitudes_resolucion_coherente' });
    });
  });

  describe('historial', () => {
    it('solo admite inserciones: rechaza UPDATE, DELETE y TRUNCATE (RN17, M4)', async () => {
      const a = await crearEscenario(db);
      const id = await registrar(db, { empresaId: a.empresaId, usuarioId: a.usuarioId, rol: 'usuario' });

      await expect(db.query("UPDATE historial SET detalle = '{\"x\":1}' WHERE id = $1", [id]))
        .rejects.toThrow('UPDATE no está permitido');
      await expect(db.query('DELETE FROM historial WHERE id = $1', [id])).rejects.toThrow('DELETE no está permitido');
      await expect(db.query('TRUNCATE historial')).rejects.toThrow('TRUNCATE no está permitido');

      const { rows } = await db.query('SELECT detalle FROM historial WHERE id = $1', [id]);
      expect(rows).toEqual([{ detalle: {} }]);
    });

    it('solo acepta las 30 acciones del catálogo (docs/01-analisis.md §7)', async () => {
      const a = await crearEscenario(db);
      const autor = { empresaId: a.empresaId, usuarioId: a.usuarioId, rol: 'usuario' as const };

      for (const accion of ACCIONES_DEL_CATALOGO) {
        await expect(registrar(db, { ...autor, accion })).resolves.toBeTypeOf('string');
      }
      await expect(registrar(db, { ...autor, accion: 'DOCUMENTO_BORRADO' }))
        .rejects.toMatchObject({ code: COMPROBACION, constraint: 'historial_accion_del_catalogo' });
    });

    it('toda acción con autor guarda el rol con el que actuó (indicador 6)', async () => {
      const a = await crearEscenario(db);

      await expect(registrar(db, { empresaId: a.empresaId, usuarioId: a.usuarioId, rol: null }))
        .rejects.toMatchObject({ code: COMPROBACION, constraint: 'historial_rol_del_autor' });
      await expect(registrar(db, { empresaId: a.empresaId, usuarioId: a.usuarioId, rol: 'administrador' }))
        .rejects.toMatchObject({ code: COMPROBACION, constraint: 'historial_rol_del_autor' });
      // Un inicio de sesión fallido con un correo inexistente no tiene autor ni empresa.
      await expect(registrar(db, { empresaId: null, usuarioId: null, rol: null, accion: 'SESION_FALLIDA' }))
        .resolves.toBeTypeOf('string');
    });
  });

  it('las columnas de búsqueda se calculan solas: sin tildes, en minúsculas y palabra por palabra (M8, D42)', async () => {
    const a = await crearEscenario(db);
    const id = await crearDocumento(db, {
      empresaId: a.empresaId, categoriaId: a.categoriaId, subidoPor: a.usuarioId, nombre: 'Cotización de Útiles',
    });
    await db.query("UPDATE documentos SET descripcion = 'Pedido N°15', archivo_nombre_original = 'Cotización_2026-03.PDF' WHERE id = $1", [id]);

    const { rows: [fila] } = await db.query(
      'SELECT busqueda_nombre, busqueda_texto, busqueda::text AS busqueda FROM documentos WHERE id = $1', [id]);

    expect(fila.busqueda_nombre).toBe('cotizacion de utiles');
    expect(fila.busqueda_texto).toBe('cotizacion de utiles cotizacion 2026 03 pdf pedido n 15');
    // Por su raíz en español: el nombre y el archivo con peso A, la descripción con B.
    expect(fila.busqueda).toContain("'cotizacion':1A,4A");
    expect(fila.busqueda).toContain("'ped':8B");
    // Nadie las escribe: ni la aplicación ni un error de código.
    await expect(db.query("UPDATE documentos SET busqueda_texto = 'otra cosa' WHERE id = $1", [id]))
      .rejects.toMatchObject({ code: '428C9' });
  });

  it('actualizado_en se renueva en cada UPDATE sin que la aplicación lo pida', async () => {
    const empresaId = await crearEmpresa(db);
    const { rows: [categoria] } = await db.query<{ id: string }>(
      "INSERT INTO categorias (empresa_id, nombre, actualizado_en) VALUES ($1, 'Vieja', '2020-01-01') RETURNING id",
      [empresaId],
    );

    const { rows } = await db.query<{ actualizado_en: Date }>(
      "UPDATE categorias SET nombre = 'Nueva' WHERE id = $1 RETURNING actualizado_en",
      [categoria?.id],
    );
    expect(rows[0]?.actualizado_en.getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('nada se borra en cascada: una empresa con usuarios no se puede borrar', async () => {
    const a = await crearEscenario(db);

    await expect(db.query('DELETE FROM empresas WHERE id = $1', [a.empresaId]))
      .rejects.toMatchObject({ code: CLAVE_FORANEA });
  });

  it('RLS está activo en todas las tablas, también en la de migraciones (D14)', async () => {
    const { rows } = await db.query<{ tabla: string; rls: boolean }>(`
      SELECT c.relname AS tabla, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY 1`);

    expect(rows).toHaveLength(13);
    expect(rows.filter((fila) => !fila.rls)).toEqual([]);
  });
});

function resolver(db: pg.Pool, solicitudId: string, estado: 'aprobada' | 'rechazada', revisorId: string, motivo: string | null = null) {
  return db.query(
    `UPDATE solicitudes SET estado = $2, revisor_id = $3, resuelta_en = now(), comentario_resolucion = $4
     WHERE id = $1`,
    [solicitudId, estado, revisorId, motivo],
  );
}

async function registrar(
  db: pg.Pool,
  datos: { empresaId: string | null; usuarioId: string | null; rol: 'administrador' | 'usuario' | null; accion?: string },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO historial (empresa_id, usuario_id, rol_usuario, accion) VALUES ($1, $2, $3, $4) RETURNING id',
    [datos.empresaId, datos.usuarioId, datos.rol, datos.accion ?? 'DOCUMENTO_SUBIDO'],
  );
  return String(rows[0]?.id);
}
