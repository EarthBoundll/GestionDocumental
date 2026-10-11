import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import type { ErrorApi } from '../api/cliente';
import type { FormatoDeExportacion } from '../api/recursos';
import { Boton } from './Boton';

/**
 * Exportar en Excel o en CSV (D44). Excel va primero: trae un resumen y la tabla que abre Power BI, y se ve bien
 * en cualquier Excel, también en uno configurado en español, donde el CSV sale en una sola columna. El CSV queda
 * para otras herramientas.
 */
export function BotonesDeExportacion({ etiqueta, exportar, alFallar }: {
  etiqueta: string;
  exportar: (formato: FormatoDeExportacion) => Promise<void>;
  alFallar: (error: ErrorApi) => void;
}) {
  const [exportando, setExportando] = useState<FormatoDeExportacion | null>(null);

  async function pulsar(formato: FormatoDeExportacion) {
    setExportando(formato);
    await exportar(formato).catch(alFallar);
    setExportando(null);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Boton variante="secundario" icono={FileSpreadsheet} cargando={exportando === 'xlsx'} disabled={exportando !== null} onClick={() => void pulsar('xlsx')}>
        {etiqueta}
      </Boton>
      <Boton variante="fantasma" cargando={exportando === 'csv'} disabled={exportando !== null} onClick={() => void pulsar('csv')}
        aria-label={`${etiqueta} en CSV`} title="En CSV, para otras herramientas">
        CSV
      </Boton>
    </span>
  );
}
