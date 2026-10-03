import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router';
import { EstadoVacio } from '../../componentes/Avisos';
import { clasesDeBoton } from '../../componentes/Boton';
import { useSesion } from '../../sesion/SesionContext';
import { inicioDe } from '../../utilidades/roles';

export function NoEncontrado() {
  const { sesion, esMaster } = useSesion();
  return (
    <EstadoVacio
      icono={FileQuestion}
      titulo="Esta página no existe"
      accion={
        <Link to={sesion ? inicioDe(sesion.usuario.rol) : '/login'} className={clasesDeBoton('secundario')}>
          {esMaster ? 'Ir a la plataforma' : 'Ir a los documentos'}
        </Link>
      }
    >
      Puede que el enlace esté mal escrito o que lo que buscabas ya no esté disponible.
    </EstadoVacio>
  );
}
