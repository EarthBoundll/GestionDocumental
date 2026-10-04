import { DatabaseBackup } from 'lucide-react';
import { useState } from 'react';
import type { ErrorApi } from '../../api/cliente';
import { plataforma } from '../../api/recursos';
import { Aviso, Cargando, EstadoVacio } from '../../componentes/Avisos';
import { Boton } from '../../componentes/Boton';
import { EncabezadoDePagina, ErrorDeCarga, Tarjeta } from '../../componentes/Pagina';
import { useConsulta } from '../../hooks/useConsulta';
import { formatearFechaHora, formatearPeso, instanteDeRespaldo } from '../../utilidades/formato';

/**
 * RF29: los respaldos de la base. El Master ve que existen y pide uno cuando quiera; no los descarga,
 * porque contienen los datos de todas las empresas (D18). Restaurar es un procedimiento de operación.
 */
export function Respaldos() {
  const consulta = useConsulta((senal) => plataforma.respaldos(senal), []);
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  async function generar() {
    setGenerando(true);
    setAviso(null);
    try {
      const respaldo = await plataforma.generarRespaldo();
      setAviso({ tipo: 'exito', texto: `Respaldo guardado (${formatearPeso(respaldo.bytes)}).` });
      consulta.recargar();
    } catch (error) {
      setAviso({ tipo: 'error', texto: (error as ErrorApi).mensaje });
    }
    setGenerando(false);
  }

  if (consulta.error) return <ErrorDeCarga error={consulta.error} alReintentar={consulta.recargar} />;
  const dias = consulta.datos?.diasDeRetencion ?? 30;
  return (
    <>
      <EncabezadoDePagina
        titulo="Respaldos"
        descripcion={`Cada noche, a las 03:00, se guarda una copia de la base en un depósito privado, y se conservan ${dias} días. Los archivos de los documentos viven aparte, en el almacenamiento.`}
        acciones={<Boton icono={DatabaseBackup} cargando={generando} onClick={() => void generar()}>Generar respaldo ahora</Boton>}
      />
      {aviso && <div className="mb-4"><Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso></div>}
      <Tarjeta>
        {!consulta.datos ? (
          <Cargando />
        ) : consulta.datos.datos.length === 0 ? (
          <EstadoVacio icono={DatabaseBackup} titulo="Aún no hay respaldos">El primero se hará esta noche, o ahora mismo si lo pides.</EstadoVacio>
        ) : (
          <ul className="divide-y divide-slate-100">
            {consulta.datos.datos.map((respaldo) => (
              <li key={respaldo.nombre} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium text-slate-900">{formatearFechaHora(instanteDeRespaldo(respaldo.nombre))}</span>
                <span className="text-slate-500">{formatearPeso(respaldo.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
      <p className="mt-4 text-xs text-slate-500">
        Por seguridad, los respaldos no se descargan desde aquí: contienen los datos de todas las empresas. Restaurar uno es un
        procedimiento de operación, descrito en la guía de despliegue.
      </p>
    </>
  );
}
