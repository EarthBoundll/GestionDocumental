import { ComoEscribir, PaginaLegal } from './PaginaLegal';

/**
 * La política de privacidad (D38), alineada con el consentimiento de docs/10. Cada dato que nombra es uno que el
 * sistema guarda de verdad: si el esquema cambia, cambia aquí.
 */
export function Privacidad() {
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      introduccion="Cómo se tratan los datos personales en el sistema de gestión documental, según la Ley N.° 29733, de Protección de Datos Personales, y su reglamento (D. S. N.° 016-2024-JUS)."
    >
      <section>
        <h2>1. Quién es el responsable</h2>
        <p>
          Diego Moisés Acosta Gerónimo, estudiante de Ingeniería de Sistemas Computacionales de la Universidad Privada del Norte
          (UPN), que desarrolla y administra el sistema como proyecto de tesis. Puedes comunicarte <ComoEscribir />.
        </p>
      </section>

      <section>
        <h2>2. Qué datos se tratan</h2>
        <ul>
          <li><strong>De tu cuenta:</strong> nombre, correo, rol, empresa y, solo si el administrador lo registra, DNI. La contraseña se guarda cifrada (bcrypt): nadie puede leerla, tampoco el responsable.</li>
          <li><strong>Tu preferencia de tema</strong> (claro, oscuro o el del dispositivo).</li>
          <li><strong>Lo que haces en el sistema:</strong> la acción, el documento u otro elemento afectado, la fecha y la hora, el navegador y si usaste un celular. En las búsquedas, el texto buscado y cuántos resultados hubo.</li>
          <li><strong>El tiempo de carga de cada listado,</strong> para medir el rendimiento del sistema.</li>
          <li><strong>Tus sesiones:</strong> cuándo empezaron y cuándo vencen.</li>
          <li><strong>Los documentos de tu empresa</strong> y sus datos (nombre, categoría, fecha, descripción y versiones). Pueden contener datos personales: la empresa decide qué sube y debe tener derecho a hacerlo.</li>
        </ul>
        <p>El sistema no guarda tu dirección IP. Los proveedores en la nube pueden registrarla en sus registros técnicos de acceso.</p>
      </section>

      <section>
        <h2>3. Para qué se usan</h2>
        <ul>
          <li>Darte acceso y prestar el servicio.</li>
          <li>Proteger la información: el aislamiento entre empresas, el bloqueo tras intentos fallidos y el historial.</li>
          <li>Enviarte el enlace para recuperar tu contraseña cuando lo pidas.</li>
          <li>Si tu empresa participa en la evaluación de la tesis, medir los indicadores del estudio con un código en lugar de tu nombre, como indica el consentimiento que firmaste.</li>
        </ul>
        <p>No se usan para publicidad, no se venden y no se ceden a nadie.</p>
      </section>

      <section>
        <h2>4. Quién los ve</h2>
        <ul>
          <li>Tú, tus datos y lo que tu rol te permite.</li>
          <li>El administrador de tu empresa: las cuentas, los documentos y el historial de la empresa.</li>
          <li>Desde el sistema, el administrador de la plataforma ve las empresas, sus administradores y cifras de uso, pero no los documentos ni el historial de cada empresa.</li>
        </ul>
      </section>

      <section>
        <h2>5. Dónde se guardan</h2>
        <p>
          La base de datos y los archivos están en Supabase, y la API en Render, ambos en Virginia, <strong>Estados Unidos</strong>.
          Vercel publica la página y Brevo envía los correos de recuperación. Es una <strong>transferencia internacional de datos
          personales</strong>. Todo viaja cifrado (HTTPS), y cada descarga usa un enlace que vence a los 5 minutos.
        </p>
      </section>

      <section>
        <h2>6. Cuánto tiempo</h2>
        <ul>
          <li>Mientras exista tu cuenta o tu empresa en la plataforma.</li>
          <li>Lo eliminado queda 30 días en la papelera, y las copias de respaldo se conservan 30 días.</li>
          <li>El historial no se modifica desde el sistema: es lo que garantiza la trazabilidad.</li>
          <li>Al cierre del estudio se eliminan los datos de la empresa evaluada, también de las copias de respaldo. Queda solo una constancia sin datos personales.</li>
        </ul>
      </section>

      <section>
        <h2>7. Cómo se protegen</h2>
        <ul>
          <li>Conexión cifrada (HTTPS) y contraseñas cifradas con bcrypt.</li>
          <li>Cada empresa está aislada por la propia base de datos, no solo por el código.</li>
          <li>Enlaces de descarga que vencen en 5 minutos, bloqueo tras intentos fallidos y una copia de respaldo cada noche.</li>
        </ul>
      </section>

      <section>
        <h2>8. Lo que se guarda en tu navegador</h2>
        <p>
          El sistema no usa cookies. Guarda tu sesión en el almacenamiento local del navegador hasta que la cierres o venza. No hay
          publicidad ni herramientas de analítica de terceros.
        </p>
      </section>

      <section>
        <h2>9. Tus derechos</h2>
        <p>
          Puedes pedir acceder a tus datos, corregirlos, cancelarlos u oponerte a su uso, <ComoEscribir />. Tu contraseña y tu tema
          los cambias tú mismo en <strong>Mi cuenta</strong>; tu nombre y tu correo, el administrador de tu empresa. La cancelación
          del historial se hace al cierre del estudio. Si consideras que no se respetaron tus derechos, puedes acudir a la Autoridad
          Nacional de Protección de Datos Personales.
        </p>
      </section>
    </PaginaLegal>
  );
}
