import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { conectarSesion } from '../api/cliente';
import { auth } from '../api/recursos';
import type { Perfil, SesionIniciada } from '../api/tipos';

const CLAVE = 'gestion-documental.sesion';

interface ValorSesion {
  sesion: SesionIniciada | null;
  esAdministrador: boolean;
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
  const navegar = useNavigate();
  const actual = useRef(sesion);
  actual.current = sesion;

  const olvidar = useCallback(() => {
    guardar(null);
    setSesion(null);
  }, []);

  // El cliente HTTP necesita el token y saber qué hacer si la API lo rechaza.
  useEffect(() => {
    conectarSesion({
      token: () => actual.current?.token ?? null,
      alCaducar: () => {
        olvidar();
        navegar('/login?motivo=sesion', { replace: true });
      },
    });
  }, [navegar, olvidar]);

  // El nombre y el rol pueden haber cambiado desde que se inició la sesión (RN05): se refrescan al abrir.
  useEffect(() => {
    if (!actual.current) return;
    const control = new AbortController();
    auth.perfil(control.signal)
      .then((perfil: Perfil) => {
        if (!actual.current) return;
        const refrescada = { ...actual.current, ...perfil };
        guardar(refrescada);
        setSesion(refrescada);
      })
      .catch(() => {});
    return () => control.abort();
  }, []);

  const valor = useMemo<ValorSesion>(() => ({
    sesion,
    esAdministrador: sesion?.usuario.rol === 'administrador',
    iniciar(nueva) {
      guardar(nueva);
      setSesion(nueva);
    },
    async cerrar() {
      // Se avisa a la API para que revoque la sesión (RF03); si no responde, se olvida igualmente aquí.
      await auth.cerrarSesion().catch(() => {});
      olvidar();
      navegar('/login', { replace: true });
    },
  }), [sesion, navegar, olvidar]);

  return <Contexto value={valor}>{children}</Contexto>;
}

export function useSesion(): ValorSesion {
  const valor = use(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return valor;
}
