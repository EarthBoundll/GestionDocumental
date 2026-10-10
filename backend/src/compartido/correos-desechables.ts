/**
 * Dominios de correos temporales conocidos (D41). Es un complemento, no la defensa: lo que asegura que el
 * correo existe y es de la persona es la invitación, que hay que abrir. Esta lista no los detecta todos
 * (aparecen dominios nuevos cada semana) ni pretende hacerlo; solo evita los más usados, sin consultar a
 * ningún servicio externo. Para sumar uno, se agrega aquí con su prueba.
 */
const DOMINIOS = new Set([
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'anonbox.net', 'burnermail.io', 'byom.de',
  'discard.email', 'dispostable.com', 'dropmail.me', 'emailondeck.com', 'fakeinbox.com', 'fakemail.net',
  'getairmail.com', 'getnada.com', 'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de',
  'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'harakirimail.com',
  'inboxkitten.com', 'mailcatch.com', 'maildrop.cc', 'mailinator.com', 'mailinator.net', 'mailnesia.com',
  'mintemail.com', 'mohmal.com', 'moakt.com', 'mytemp.email', 'sharklasers.com', 'spam4.me', 'spamgourmet.com',
  'temp-mail.io', 'temp-mail.org', 'tempail.com', 'tempmail.com', 'tempmail.dev', 'tempmail.net', 'tempmailo.com',
  'tempr.email', 'throwawaymail.com', 'trashmail.com', 'trashmail.de', 'trashmail.net', 'yopmail.com',
  'yopmail.fr', 'yopmail.net',
]);

/** Si el correo es de un servicio de correos temporales conocido. El correo llega ya en minúsculas. */
export function esCorreoDesechable(email: string): boolean {
  const dominio = email.slice(email.lastIndexOf('@') + 1);
  return DOMINIOS.has(dominio);
}
