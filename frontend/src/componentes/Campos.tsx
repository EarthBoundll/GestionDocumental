import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const CONTROL = 'block w-full rounded-lg border bg-superficie px-3 py-2.5 text-base text-slate-900 shadow-xs sm:text-sm '
  + 'placeholder:text-slate-400 disabled:bg-slate-100 aria-invalid:border-red-500 aria-invalid:ring-1 aria-invalid:ring-red-500';

interface Envoltura {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: ReactNode;
  opcional?: boolean;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Cuando el formulario vuelve con errores, el foco va al primer campo inválido. En un celular el error
 * puede quedar fuera de la pantalla, encima del botón que se acaba de pulsar; así se ve y se corrige.
 */
function useEnfocarSiEsElPrimerError<T extends Control>(error: string | undefined) {
  const control = useRef<T>(null);
  useEffect(() => {
    const elemento = control.current;
    if (error && elemento && elemento.form?.querySelector('[aria-invalid="true"]') === elemento) elemento.focus();
  }, [error]);
  return control;
}

/** Etiqueta, control, ayuda y error, unidos por id para que un lector de pantalla los lea juntos. */
function ConEtiqueta({ etiqueta, error, ayuda, opcional, children }: Envoltura & { children: (props: { id: string; describedBy?: string }) => ReactNode }) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describedBy = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {etiqueta}
        {opcional && <span className="font-normal text-slate-500"> (opcional)</span>}
      </label>
      {children({ id, describedBy })}
      {ayuda && <p id={idAyuda} className="text-xs text-slate-500">{ayuda}</p>}
      {error && <p id={idError} className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

/**
 * Una contraseña se puede mostrar con el ojo: en el celular es fácil equivocarse de tecla sin verlo. El nombre del
 * botón no cambia, lo que cambia es si está pulsado (aria-pressed), como pide el patrón de un botón conmutable.
 */
function ConOjo({ id, visible, alternar, children }: { id: string; visible: boolean; alternar(): void; children: ReactNode }) {
  const Icono = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      {children}
      <button type="button" onClick={alternar} aria-pressed={visible} aria-controls={id} aria-label="Mostrar la contraseña"
        title={visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 transition-colors hover:text-slate-800">
        <Icono aria-hidden className="size-5" />
      </button>
    </div>
  );
}

export function Campo({ etiqueta, error, ayuda, opcional, className = '', type, ...props }: Envoltura & InputHTMLAttributes<HTMLInputElement>) {
  const control = useEnfocarSiEsElPrimerError<HTMLInputElement>(error);
  const [visible, setVisible] = useState(false);
  const esClave = type === 'password';
  return (
    <ConEtiqueta etiqueta={etiqueta} error={error} ayuda={ayuda} opcional={opcional}>
      {({ id, describedBy }) => {
        const entrada = (
          <input ref={control} id={id} type={esClave && visible ? 'text' : type} aria-invalid={Boolean(error)} aria-describedby={describedBy}
            className={`${CONTROL} border-slate-300 ${esClave ? 'pr-12' : ''} ${className}`} {...props} />
        );
        return esClave ? <ConOjo id={id} visible={visible} alternar={() => setVisible((antes) => !antes)}>{entrada}</ConOjo> : entrada;
      }}
    </ConEtiqueta>
  );
}

export function Selector({ etiqueta, error, ayuda, opcional, children, ...props }: Envoltura & SelectHTMLAttributes<HTMLSelectElement>) {
  const control = useEnfocarSiEsElPrimerError<HTMLSelectElement>(error);
  return (
    <ConEtiqueta etiqueta={etiqueta} error={error} ayuda={ayuda} opcional={opcional}>
      {({ id, describedBy }) => (
        <select ref={control} id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={`${CONTROL} border-slate-300`} {...props}>
          {children}
        </select>
      )}
    </ConEtiqueta>
  );
}

export function AreaTexto({ etiqueta, error, ayuda, opcional, ...props }: Envoltura & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const control = useEnfocarSiEsElPrimerError<HTMLTextAreaElement>(error);
  return (
    <ConEtiqueta etiqueta={etiqueta} error={error} ayuda={ayuda} opcional={opcional}>
      {({ id, describedBy }) => (
        <textarea ref={control} id={id} rows={3} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={`${CONTROL} border-slate-300`} {...props} />
      )}
    </ConEtiqueta>
  );
}
