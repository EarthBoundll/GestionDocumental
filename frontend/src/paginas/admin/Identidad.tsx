import { ShieldX } from 'lucide-react';
import { useEffect } from 'react';
import { identidad } from '../../api/recursos';
import { Cargando, EstadoVacio } from '../../componentes/Avisos';
import { EncabezadoDePagina, ErrorDeCarga } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { useSesion } from '../../sesion/SesionContext';
import { EditorDeIdentidad } from '../identidad/EditorDeIdentidad';

/**
 * RF31: la identidad de la propia empresa. La lee cualquiera de la empresa (la API la entrega a todos para
 * pintar el menú), así que aquí no hay un 403 que lo diga: la pantalla se cierra a quien no administra, y
 * la API y la base rechazan igualmente sus cambios (008).
 */
export function Identidad() {
  const { sesion, esAdministrador } = useSesion();
  if (!esAdministrador || !sesion?.empresa) {
    return (
      <EstadoVacio icono={ShieldX} titulo="No tienes permiso para ver esto">
        La identidad de la empresa la cambia su administrador.
      </EstadoVacio>
    );
  }
  return <IdentidadDeLaEmpresa razonSocial={sesion.empresa.nombre} />;
}

function IdentidadDeLaEmpresa({ razonSocial }: { razonSocial: string }) {
  const { actualizarMarca } = useSesion();
  const consulta = useConsulta((senal) => identidad.obtener(senal), []);

  // La sesión pudo abrirse antes de que otro administrador la cambiara: se toma la de ahora.
  useEffect(() => {
    if (consulta.datos) actualizarMarca(consulta.datos);
  }, [consulta.datos, actualizarMarca]);

  return (
    <>
      <EncabezadoDePagina
        titulo="Identidad"
        descripcion="El nombre comercial, el color y el logo con los que todas las personas de tu empresa ven el sistema."
      />
      {consulta.error ? (
        <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />
      ) : !consulta.datos ? (
        <Cargando />
      ) : (
        <EditorDeIdentidad razonSocial={razonSocial} marca={consulta.datos} operaciones={identidad} alGuardar={actualizarMarca} />
      )}
    </>
  );
}
