/** ¿El error es de PostgreSQL y lo produjo esa restricción concreta? */
export function violaRestriccion(error: unknown, restriccion: string): boolean {
  return typeof error === 'object' && error !== null && 'constraint' in error && error.constraint === restriccion;
}
