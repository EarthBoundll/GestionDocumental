import { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { conectarSesion } from '../api/cliente';
import { auth } from '../api/recursos';
import type { Marca, Perfil, SesionIniciada, Tema } from '../api/tipos';
import { aplicarColor, aplicarTema } from './apariencia';

const CLAVE = 'gestion-documental.sesion';
const MARCA_DE_LA_PLATAFORMA: Marca = { nombreComercial: null, colorPrimario: null, logoUrl: null };

interface ValorSesion {
  sesion: SesionIniciada | null;
  /** La API dejó de aceptar la sesión (caducó, o se desactivó la cuenta o la empresa): se avisa al volver a entrar. */
  caducada: boolean;
  /** La persona cerró su sesión: el inicio de sesión se lo confirma (D37). */
  cerrada: boolean;
  esAdministrador: boolean;
  /** El Master no pertenece a ninguna empresa: su área es la plataforma. */
  esMaster: boolean;
  iniciar(sesion: SesionIniciada): void;
  cerrar(): Promise<void>;
  /** RF32: se ve en el acto y se guarda en la cuenta; si la API no lo guarda, vuelve el anterior y se lanza el error. */
  cambiarTema(tema: Tema): Promise<void>;
  /** Tras cambiar la identidad de la propia empresa: se ve sin volver a entrar. */
  actualizarMarca(marca: Marca): void;
  /** Mientras se elige un color, toda la interfaz lo muestra; null vuelve al guardado. */
  previsualizarColor(color: string | null): void;
}

const Contexto = createContext<ValorSesion | null>(null);

/** Una sesión guardada antes de la identidad y el tema (008) no los trae: valen los de siempre. */
function completar(sesion: SesionIniciada): SesionIniciada {
  const { usuario, empresa } = sesion;
  return {
    ...sesion,
    usuario: { ...usuario, tema: usuario.tema ?? 'sistema' },
    empresa: empresa && { ...empresa, marca: empresa.marca ?? MARCA_DE_LA_PLATAFORMA },
  };
}

// El almacenamiento puede no estar disponible (navegación privada, cookies bloqueadas): la sesión
// funciona igual, solo que no sobrevive a cerrar la pestaña.
function leerGuardada(): SesionIniciada | null {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as SesionIniciada | null;
    return guardada && new Date(guardada.expiraEn) > new Date() ? completar(guardada) : null;
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
  const [cerrada, setCerrada] = useState(false);
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  const actual = useRef(sesion);
  actual.current = sesion;

  // La referencia se actualiza en el acto, sin esperar al siguiente render: una respuesta que llegue justo
  // después (el perfil, otra pantalla) no debe usar ni resucitar una sesión que ya se dio por terminada.
  const cambiar = useCallback((nueva: SesionIniciada | null) => {
    const completa = nueva && completar(nueva);
    actual.current = completa;
    guardar(completa);
    setSesion(completa);
  }, []);
  const olvidar = useCallback(() => cambiar(null), [cambiar]);

  // La apariencia se aplica antes de pintar: sin un instante en el tema o el color equivocados. Sin
  // sesión (al iniciarla, tras cerrarla) vale la del dispositivo y el color de la plataforma.
  // Estables: las pantallas los usan en sus efectos.
  const actualizarMarca = useCallback((marca: Marca) => {
    const vigente = actual.current;
    if (vigente?.empresa) cambiar({ ...vigente, empresa: { ...vigente.empresa, marca } });
  }, [cambiar]);

  const tema = sesion?.usuario.tema ?? 'sistema';
  const color = vistaPrevia ?? sesion?.empresa?.marca.colorPrimario ?? null;
  useLayoutEffect(() => aplicarTema(tema), [tema]);
  useLayoutEffect(() => aplicarColor(color), [color]);

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
    cerrada,
    esAdministrador: sesion?.usuario.rol === 'administrador',
    esMaster: sesion?.usuario.rol === 'master',
    iniciar(nueva) {
      cambiar(nueva);
      setCaducada(false);
      setCerrada(false);
    },
    async cerrar() {
      // Se avisa a la API para que revoque la sesión (RF03); si no responde, se olvida igualmente aquí.
      await auth.cerrarSesion().catch(() => {});
      // Como al caducar, no se navega desde aquí: RutaConSesion lleva a iniciar sesión con el motivo.
      setCerrada(true);
      olvidar();
    },
    async cambiarTema(nuevo) {
      const antes = actual.current;
      if (!antes) return;
      const conTema = (base: SesionIniciada, elegido: Tema) => ({ ...base, usuario: { ...base.usuario, tema: elegido } });
      cambiar(conTema(antes, nuevo));
      try {
        await auth.cambiarPreferencias(nuevo);
      } catch (error) {
        if (actual.current?.token === antes.token) cambiar(conTema(actual.current, antes.usuario.tema));
        throw error;
      }
    },
    actualizarMarca,
    previsualizarColor: setVistaPrevia,
  }), [sesion, caducada, cerrada, cambiar, olvidar, actualizarMarca]);

  return <Contexto value={valor}>{children}</Contexto>;
}

export function useSesion(): ValorSesion {
  const valor = use(Contexto);
  if (!valor) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return valor;
}
