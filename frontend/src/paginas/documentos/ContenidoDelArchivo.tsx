import { Link } from 'react-router';
import type { Documento, EstadoDelContenido, PalabrasClave } from '../../api/tipos';

const NOMBRE_DEL_DATO: Record<PalabrasClave['datos'][number]['tipo'], string> = {
  ruc: 'RUC',
  comprobante: 'Comprobante',
  monto: 'Monto',
  fecha: 'Fecha',
};

/** Un RUC o un número de comprobante llevan a los otros documentos que lo dicen; un monto o una fecha no. */
const SE_BUSCA: ReadonlySet<string> = new Set(['ruc', 'comprobante']);

/** Por qué un archivo no tiene texto que mostrar, y cómo se lo encuentra entonces. */
const SIN_PALABRAS: Record<Exclude<EstadoDelContenido, 'leido'>, string> = {
  pendiente: 'El texto del archivo se está leyendo: en unos minutos también se encontrará por lo que dice.',
  sin_texto: 'El archivo no trae texto, como un escaneo: se encuentra por su nombre, su descripción y su categoría.',
  no_admitido: 'El sistema lee el texto de los PDF, Word y Excel; este archivo se encuentra por su nombre, su descripción y su categoría.',
  ilegible: 'No se pudo leer el texto del archivo (puede estar protegido o dañado): se encuentra por su nombre, su descripción y su categoría.',
};

const buscar = (texto: string) => `/documentos?q=${encodeURIComponent(texto)}`;
const CLASES_DE_ETIQUETA = 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200';

/**
 * Lo que dice el archivo vigente (D45): los datos que se reconocen por su forma y las palabras propias del
 * documento, cada una un atajo a buscarla. Sin IA: se puede explicar por qué salió cada una.
 */
export function ContenidoDelArchivo({ contenido }: { contenido: Documento['contenido'] }) {
  const { estado, palabrasClave } = contenido;
  if (estado !== 'leido' || !palabrasClave) {
    return <p className="text-sm text-slate-600">{SIN_PALABRAS[estado === 'leido' ? 'sin_texto' : estado]}</p>;
  }
  const { datos, palabras } = palabrasClave;
  return (
    <div className="space-y-3">
      {datos.length > 0 && (
        <ul aria-label="Datos reconocidos en el archivo" className="flex flex-wrap gap-1.5">
          {datos.map(({ tipo, valor }) => (
            <li key={`${tipo}-${valor}`}>
              {SE_BUSCA.has(tipo)
                ? <Link to={buscar(valor)} className={`${CLASES_DE_ETIQUETA} hover:bg-marca-50 hover:text-marca-800 hover:ring-marca-200`}>
                    <span className="text-slate-500">{NOMBRE_DEL_DATO[tipo]}</span> <span className="font-medium tabular-nums">{valor}</span>
                  </Link>
                : <span className={CLASES_DE_ETIQUETA}>
                    <span className="text-slate-500">{NOMBRE_DEL_DATO[tipo]}</span> <span className="font-medium tabular-nums">{valor}</span>
                  </span>}
            </li>
          ))}
        </ul>
      )}
      {palabras.length > 0 && (
        <ul aria-label="Palabras clave del archivo" className="flex flex-wrap gap-1.5">
          {palabras.map((palabra) => (
            <li key={palabra}>
              <Link to={buscar(palabra)} title={`Buscar «${palabra}»`}
                className="inline-flex rounded-full bg-marca-50 px-2.5 py-1 text-xs font-medium text-marca-800 ring-1 ring-marca-200 hover:bg-marca-100">
                {palabra}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">Salen del texto del archivo, sin IA. Cada una busca los documentos que la mencionan.</p>
    </div>
  );
}
