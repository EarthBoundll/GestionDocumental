import { Building2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ErrorApi } from '../../api/cliente';
import { plataforma } from '../../api/recursos';
import { Aviso } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { Campo } from '../../componentes/Campos';
import { EncabezadoDePagina, Tarjeta } from '../../componentes/Pagina';

const VACIO = { empresa: '', ruc: '', nombre: '', email: '', dni: '', clave: '', confirmacion: '' };

/** No hay registro público (decisión B): el Master da de alta cada empresa con su primer administrador. */
export function NuevaEmpresa() {
  const navegar = useNavigate();
  const [datos, setDatos] = useState(VACIO);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo: keyof typeof VACIO) => (evento: { target: { value: string } }) =>
    setDatos((anteriores) => ({ ...anteriores, [campo]: evento.target.value }));

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    // La confirmación solo protege de un error al teclear; no viaja a la API.
    if (datos.clave !== datos.confirmacion) {
      setError(new ErrorApi(400, 'VALIDACION', 'Revisa los datos', [{ campo: 'confirmacion', mensaje: 'Las contraseñas no coinciden' }]));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const { empresa } = await plataforma.crearEmpresa({
        empresa: { nombre: datos.empresa, ruc: datos.ruc },
        administrador: { nombre: datos.nombre, email: datos.email, dni: datos.dni, clave: datos.clave },
      });
      navegar(`/plataforma/empresas/${empresa.id}`, { state: { creada: true } });
    } catch (causa) {
      setError(causa as ErrorApi);
      setEnviando(false);
    }
  }

  const errores = error?.porCampo() ?? {};
  return (
    <>
      <EncabezadoDePagina
        titulo="Nueva empresa"
        descripcion="La empresa nace con su primer administrador y con cinco categorías para empezar a clasificar."
      />
      <Tarjeta className="max-w-2xl p-4 sm:p-6">
        <form onSubmit={(evento) => void enviar(evento)} className="space-y-6" noValidate>
          {error && !error.detalles.length && <Aviso tipo="error">{error.mensaje}</Aviso>}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-900">Empresa</legend>
            <Campo etiqueta="Nombre o razón social" required autoComplete="off" value={datos.empresa} onChange={cambiar('empresa')} error={errores['empresa.nombre']} />
            <Campo etiqueta="RUC" opcional inputMode="numeric" maxLength={11} value={datos.ruc} onChange={cambiar('ruc')} error={errores['empresa.ruc']} />
          </fieldset>
          <fieldset className="space-y-4 border-t border-slate-200">
            <legend className="pt-6 text-sm font-semibold text-slate-900">Su primer administrador</legend>
            <Campo etiqueta="Nombre" required autoComplete="off" value={datos.nombre} onChange={cambiar('nombre')} error={errores['administrador.nombre']} />
            <Campo etiqueta="Correo" type="email" required autoComplete="off" inputMode="email" value={datos.email} onChange={cambiar('email')}
              error={errores['administrador.email']} ayuda="Con este correo entrará al sistema." />
            <Campo etiqueta="DNI" opcional inputMode="numeric" maxLength={8} value={datos.dni} onChange={cambiar('dni')}
              error={errores['administrador.dni']} ayuda="Es un dato de su perfil; no sirve para entrar." />
            <Campo etiqueta="Contraseña inicial" type="password" required autoComplete="new-password" value={datos.clave} onChange={cambiar('clave')}
              error={errores['administrador.clave']} ayuda="Al menos 8 caracteres. Comunícasela en persona; podrá cambiarla en «Mi cuenta»." />
            <Campo etiqueta="Repite la contraseña" type="password" required autoComplete="new-password" value={datos.confirmacion} onChange={cambiar('confirmacion')} error={errores.confirmacion} />
          </fieldset>
          <Boton type="submit" icono={Building2} cargando={enviando}>Registrar empresa</Boton>
        </form>
      </Tarjeta>
    </>
  );
}
