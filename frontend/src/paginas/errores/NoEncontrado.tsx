import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router';
import { EstadoVacio } from '../../componentes/Avisos';
import { clasesDeBoton } from '../../componentes/Boton';

export function NoEncontrado() {
  return (
    <EstadoVacio
      icono={FileQuestion}
      titulo="Esta página no existe"
      accion={<Link to="/documentos" className={clasesDeBoton('secundario')}>Ir a los documentos</Link>}
    >
      Puede que el enlace esté mal escrito o que lo que buscabas ya no esté disponible.
    </EstadoVacio>
  );
}
