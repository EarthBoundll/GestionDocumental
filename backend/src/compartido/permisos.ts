export const ROLES = ['administrador', 'usuario'] as const;
export type Rol = (typeof ROLES)[number];

/**
 * La matriz de permisos de docs/01-analisis.md §6, y el único sitio donde se decide qué puede hacer
 * cada rol. Lo que no aparece aquí lo puede hacer cualquier usuario con sesión; las reglas de
 * propiedad («solo los suyos») las aplica cada servicio consultando esta misma tabla.
 */
const PERMISOS = {
  GESTIONAR_USUARIOS: ['administrador'],
  GESTIONAR_CATEGORIAS: ['administrador'],
  VER_CATEGORIAS_INACTIVAS: ['administrador'],
  GESTIONAR_CUALQUIER_DOCUMENTO: ['administrador'],
  VER_TODAS_LAS_SOLICITUDES: ['administrador'],
  RESOLVER_SOLICITUDES: ['administrador'],
  CONSULTAR_HISTORIAL: ['administrador'],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  const rolesConPermiso: readonly Rol[] = PERMISOS[permiso];
  return rolesConPermiso.includes(rol);
}
