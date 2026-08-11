import { useMemo, useState } from 'react';
import { ClientTable } from './ClientTable';
import { DocTable } from './DocTable';
import { num } from '../lib/format';
import type { EnrichedDoc } from '../lib/metrics';

/** Forma de agrupar la tabla. No filtra: cambia cómo se presenta lo mismo. */
export type Vista = 'documento' | 'cliente';

const OPCIONES: { valor: Vista; etiqueta: string }[] = [
  { valor: 'documento', etiqueta: 'Por documento' },
  { valor: 'cliente', etiqueta: 'Por cliente' },
];

interface Props {
  docs: EnrichedDoc[];
  vista: Vista;
  onVista: (v: Vista) => void;
}

export function TableSection({ docs, vista, onVista }: Props) {
  const [abiertos, setAbiertos] = useState<string[]>([]);

  const clientes = useMemo(() => [...new Set(docs.map((d) => d.clienteNombre))], [docs]);

  // Solo cuentan los clientes que siguen visibles: si un filtro esconde a uno
  // desplegado, el botón no debe quedarse en «Contraer todo».
  const visiblesAbiertos = clientes.filter((c) => abiertos.includes(c)).length;
  const todosAbiertos = clientes.length > 0 && visiblesAbiertos === clientes.length;

  return (
    <section className="card">
      <div className="tabla-cabecera">
        <div>
          <h3 className="section-title">{vista === 'documento' ? 'Detalle de documentos' : 'Resumen por cliente'}</h3>
          <p className="section-sub" style={{ marginBottom: 0 }}>
            {vista === 'documento'
              ? 'Una fila por documento. Haz clic en un encabezado para ordenar.'
              : 'Una fila por cliente. Haz clic en una fila para ver sus documentos.'}
          </p>
        </div>
        <div className="tabla-controles">
          {vista === 'cliente' && (
            <button
              type="button"
              className="btn"
              onClick={() => setAbiertos(todosAbiertos ? [] : clientes)}
              disabled={clientes.length === 0}
            >
              {todosAbiertos ? 'Contraer todo' : `Desplegar todo (${num(clientes.length)})`}
            </button>
          )}
          <div className="segmentado" role="group" aria-label="Forma de agrupar">
            {OPCIONES.map((o) => (
              <button key={o.valor} type="button" aria-pressed={vista === o.valor} onClick={() => onVista(o.valor)}>
                {o.etiqueta}
              </button>
            ))}
          </div>
        </div>
      </div>

      {vista === 'documento' ? (
        <DocTable docs={docs} />
      ) : (
        <ClientTable docs={docs} abiertos={abiertos} onAbiertos={setAbiertos} />
      )}
    </section>
  );
}
