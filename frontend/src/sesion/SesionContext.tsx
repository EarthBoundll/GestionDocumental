import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { conectarSesion } from '../api/cliente';
import { auth } from '../api/recursos';
import type { Perfil, SesionIniciada } from '../api/tipos';

const CLAVE = 'gestion-documental.sesion';

interface ValorSesion {
  sesion: SesionIniciada | null;
  /** La API dejó de aceptar la sesión (caducó, o se desactivó la cuenta o la empresa): se avisa al volver a entrar. */
  caducada: boolean;
  esAdministrador: boolean;
  /** El Master no pertenece a ninguna empresa: su área es la plataforma. */
  esMaster: boolean;
  iniciar(sesion: SesionIniciada): void;
  cerrar(): Promise<void>;
}

const Contexto = createContext<ValorSesion | null>(null);

// El almacenamiento puede no estar disponible (navegación privada, cookies bloqueadas): la sesión
// funciona igual, solo que no sobrevive a cerrar la pestaña.
function leerGuardada(): SesionIniciada | null {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as SesionIniciada | null;
    return guardada && new Date(guardada.expiraEn) > new Date() ? guardada : null;
  } catch {
    return null;
  }
}

function guardar(sesion: SesionIniciada | null): void {
  try {
    if (sesion) localStorage.setItem(CLAVE, JSON.stringify(sesion));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento, la sesión vive solo en memoria.
  }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionIniciada | null>(leerGuardada);
  const [caducada, setCaducada] = useState(false);
  const navegar = useNavigate();
  const actual = useRef(sesion);
  actual.current = sesion;

  // La referencia se actualiza en el acto, sin esperar al siguiente render: una respuesta que llegue justo
  // después (el perfil, otra pantalla) no debe usar ni resucitar una sesión que ya se dio por terminada.
  const cambiar = useCallback((nueva: SesionIniciada | null) => {
    actual.current = nueva;
    guardar(nueva);
    setSesion(nueva);
  }, []);
  const olvidar = useCallback(() => cambiar(null), [cambiar]);

  // El cliente HTTP necesita el token y saber qué hacer si la API lo rechaza. Va en un efecto de diseño
  // (useLayoutEffect) porque React ejecuta los efectos normales de los hijos antes que los del padre: con
  // un useEffect, al recargar, las primeras peticiones de la pantalla saldrían sin token y recibirían 401.
  // No se navega desde aquí: sin sesión, RutaConSesion lleva a iniciar sesión, y dos redirecciones a la
  // vez pisarían el aviso.
  useLayoutEffect(() => {
    conectarSesion({
      token: () => actual.current?.token ?? null,
      alCaducar: () => {
        olvidar();
        setCaducada(true);
      },
    });
  }, [olvidar]);

  // El nombre y el rol pueden haber cambiado desde que se inició la sesión (RN05): se refrescan al abrir.
  useEffect(() => {
    const inicial = actual.current;
    if (!inicial) return;
    const control = new AbortController();
    auth.perfil(control.signal)
      .then((perfil: Perfil) => {
        // Solo si sigue siendo la misma sesión: entretanto pudo cerrarse o caducar.
        if (actual.current?.token === inicial.token) cambiar({ ...inicial, ...perfil });
      })
      .catch(() => {});
    return () => control.abort();
  }, [cambiar]);

  const valor = useMemo<ValorSesion>(() => ({
    sesion,
    caducada,
    esAdministrador: sesion?.usuario.rol === 'administrador',
    esMaster: sesion?.usuario.rol === 'master',
    iniciar(nueva) {
      cambiar(nueva);
      setCaducada(false);
    },
    async cerrar() {
      // Se avisa a la API para que revoque la sesión (RF03); si no responde, se olvida igualmente aquí.
      await auth.cerrarSesion().catch(() => {});
      olvidar();
      navegar('/login', { replace: true });
    },
  }), [sesion, caducada, navegar, cambiar, olvidar]);

  return <Contexto value={valor}>{children}</Contexto>;
}

export function useSesion(): ValorSesion {
  const valor = use(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return valor;
}
