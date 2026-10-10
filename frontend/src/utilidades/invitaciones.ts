/** Un aviso de página: lo que se le dice a quien acaba de hacer algo. */
export interface AvisoDePagina {
  tipo: 'exito' | 'error' | 'advertencia';
  texto: string;
}

/** Lo que se le dice a quien crea una cuenta (D41): si la invitación salió, o que la reenvíe desde la lista. */
export function avisoDeInvitacion(nombre: string, email: string, enviada: boolean): AvisoDePagina {
  return enviada
    ? { tipo: 'exito', texto: `Le enviamos a ${email} una invitación. Cuando la abra, ${nombre} definirá su contraseña y podrá entrar; el enlace vale 72 horas.` }
    : { tipo: 'advertencia', texto: `La cuenta de ${nombre} se creó, pero el correo de invitación no salió. Reenvíaselo desde la lista en unos minutos.` };
}
