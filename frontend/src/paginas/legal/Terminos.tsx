import { Link } from 'react-router';
import { ComoEscribir, PaginaLegal } from './PaginaLegal';

/** Los términos de uso (D38). Cada afirmación describe lo que el sistema hace de verdad: si cambia, cambia aquí. */
export function Terminos() {
  return (
    <PaginaLegal
      titulo="Términos de uso"
      introduccion="Estos términos regulan el uso del sistema de gestión documental, un prototipo desarrollado como proyecto de tesis en la Universidad Privada del Norte (UPN). Al iniciar sesión, aceptas estos términos."
    >
      <section>
        <h2>1. Qué es el servicio</h2>
        <p>
          Un sistema web en la nube para subir, organizar, buscar, aprobar y conservar los documentos de una empresa, con un
          historial de cada acción. Lo desarrolla y administra Diego Moisés Acosta Gerónimo, estudiante de Ingeniería de Sistemas
          Computacionales de la UPN, para su tesis «Desarrollo de un sistema web basado en Cloud Computing para el mejoramiento de
          la gestión documental en micro y pequeñas empresas de Lima, 2026».
        </p>
        <p>Es un <strong>prototipo académico y gratuito</strong>, no un servicio comercial.</p>
      </section>

      <section>
        <h2>2. Las cuentas</h2>
        <ul>
          <li>No hay registro público. Las empresas las da de alta el administrador de la plataforma, a pedido de cada empresa, y el administrador de cada empresa crea las cuentas de su personal.</li>
          <li>Cada cuenta es personal: no compartas tu contraseña. Tras varios intentos fallidos, la cuenta se bloquea por un tiempo.</li>
          <li>El administrador de tu empresa puede desactivar tu cuenta, y el de la plataforma puede desactivar una empresa. Desactivar cierra las sesiones abiertas en el acto.</li>
        </ul>
      </section>

      <section>
        <h2>3. Los documentos</h2>
        <ul>
          <li>Los documentos son de la empresa que los sube. La plataforma no los usa para ningún otro fin.</li>
          <li>Cada empresa ve solo lo suyo y, dentro de ella, cada persona ve lo que su rol y las categorías le permiten. Desde el sistema, el administrador de la plataforma no puede abrir los documentos de ninguna empresa.</li>
          <li>Se admiten PDF, imágenes (JPG y PNG), Word y Excel de hasta 10 MB. El sistema comprueba que cada archivo sea lo que dice ser.</li>
        </ul>
      </section>

      <section>
        <h2>4. Uso aceptable</h2>
        <ul>
          <li>No subas contenido ilícito, programas maliciosos ni documentos con datos personales de otras personas que no tengas derecho a compartir.</li>
          <li>No intentes acceder a la información de otra empresa ni eludir los controles del sistema. Cada intento queda registrado.</li>
        </ul>
      </section>

      <section>
        <h2>5. El historial</h2>
        <p>
          Cada acción (iniciar sesión, subir, ver, descargar, buscar, aprobar o eliminar un documento, entre otras) queda en un
          historial que no se puede modificar desde el sistema. El administrador de tu empresa puede consultarlo. Qué datos guarda
          está en la <Link to="/privacidad" className="font-medium text-marca-700 underline">política de privacidad</Link>.
        </p>
      </section>

      <section>
        <h2>6. Disponibilidad y copias</h2>
        <ul>
          <li>El sistema funciona sobre servicios en la nube de capa gratuita: puede tardar unos segundos en responder y tener interrupciones. No se garantiza una disponibilidad continua.</li>
          <li>Cada noche se guarda una copia de respaldo de la base de datos, que se conserva 30 días. Aun así, conserva tus originales.</li>
          <li>Lo que se elimina va a la papelera y se puede restaurar durante 30 días; después se borra.</li>
        </ul>
      </section>

      <section>
        <h2>7. Fin del servicio</h2>
        <p>
          El servicio existe mientras dure el estudio. Al cerrarlo, en la fecha acordada con cada empresa, se eliminan sus datos
          del sistema y de las copias de respaldo. Se avisará con anticipación para que la empresa pueda descargar sus documentos.
        </p>
      </section>

      <section>
        <h2>8. Responsabilidad</h2>
        <p>
          Al ser un prototipo académico gratuito, se ofrece tal como está. El responsable aplica las medidas de seguridad descritas
          en la política de privacidad, pero no responde por pérdidas causadas por interrupciones de los proveedores en la nube.
        </p>
      </section>

      <section>
        <h2>9. Cambios, ley y contacto</h2>
        <p>
          Si estos términos cambian, se actualiza la fecha de arriba y, si el cambio es importante, se avisa a los administradores
          de cada empresa. Se rigen por las leyes del Perú. Para cualquier consulta, puedes comunicarte <ComoEscribir />.
        </p>
      </section>
    </PaginaLegal>
  );
}
