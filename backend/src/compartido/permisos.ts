export const ROLES = ['master', 'administrador', 'usuario'] as const;
export type Rol = (typeof ROLES)[number];

/** Los roles que existen dentro de una empresa. El Master no es uno de ellos. */
export const ROLES_DE_EMPRESA = ['administrador', 'usuario'] as const;
export type RolDeEmpresa = (typeof ROLES_DE_EMPRESA)[number];

/**
 * La matriz de permisos de docs/01-analisis.md §6, y el único sitio donde se decide qué puede hacer
 * cada rol. Las reglas de propiedad («solo los suyos») las aplica cada servicio consultando esta tabla.
 */
const PERMISOS = {
  // Todo lo que vive dentro de una empresa. El Master no pertenece a ninguna: no lo tiene.
  USAR_DATOS_DE_EMPRESA: ['administrador', 'usuario'],
  GESTIONAR_USUARIOS: ['administrador'],
  GESTIONAR_CATEGORIAS: ['administrador'],
  VER_CATEGORIAS_INACTIVAS: ['administrador'],
  GESTIONAR_CUALQUIER_DOCUMENTO: ['administrador'],
  GESTIONAR_PAPELERA: ['administrador'],
  VER_TODAS_LAS_SOLICITUDES: ['administrador'],
  RESOLVER_SOLICITUDES: ['administrador'],
  CONSULTAR_HISTORIAL: ['administrador'],
  // RF35: el inventario de la empresa sale entero; un usuario busca y descarga lo suyo, no lo exporta.
  EXPORTAR_LISTADO: ['administrador'],
  VER_TABLERO: ['administrador'],
  // RF31: el nombre comercial, los colores, el logo y el fondo de su empresa. El Master lo hace desde la plataforma.
  GESTIONAR_IDENTIDAD: ['administrador'],
  // Empresas, sus administradores y métricas de la plataforma.
  GESTIONAR_PLATAFORMA: ['master'],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  const rolesConPermiso: readonly Rol[] = PERMISOS[permiso];
  return rolesConPermiso.includes(rol);
}
