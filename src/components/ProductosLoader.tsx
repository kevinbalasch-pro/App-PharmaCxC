import { useRef } from 'react';
import { num } from '../lib/format';
import type { CatalogoProductos } from '../lib/ingest/productos';

interface Props {
  catalogo: CatalogoProductos | null;
  onFile: (f: File) => void;
  onClear: () => void;
  error: string | null;
}

/** Carga del archivo complementario de productos por factura. */
export function ProductosLoader({ catalogo, onFile, onClear, error }: Props) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <button className="btn" onClick={() => input.current?.click()}>
        {catalogo ? 'Cambiar productos' : 'Cargar productos'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".xls,.xlsx,.xlsm,.csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {catalogo && (
        <button className="btn btn-ghost" onClick={onClear} title="Quitar el archivo de productos">
          Quitar
        </button>
      )}
      {error && (
        <div className="alert warn no-print" style={{ width: '100%', marginTop: 10 }}>
          <span aria-hidden>⚠</span>
          <span>{error}</span>
        </div>
      )}
    </>
  );
}

export function ProductosResumen({ catalogo }: { catalogo: CatalogoProductos | null }) {
  if (!catalogo) return null;
  const d = catalogo.diag;
  const sinProductos = d.coincidencias === 0;
  const cobertura = d.documentosDelReporte > 0 ? Math.round((d.coincidencias / d.documentosDelReporte) * 100) : 0;

  return (
    <div className={`alert ${sinProductos ? 'warn' : 'ok'} no-print`}>
      <span aria-hidden>{sinProductos ? '⚠' : '✓'}</span>
      <span>
        <strong>{catalogo.fileName}</strong> · hoja «{catalogo.sheetName}» ·{' '}
        {d.layout === 'agrupada' ? 'reporte agrupado por producto' : 'tabla plana'} · {num(d.filasDetalle)} líneas
        leídas, de las que {num(d.lineas)} pertenecen a documentos de este reporte.{' '}
        <strong>
          {num(d.coincidencias)} de {num(d.documentosDelReporte)} documentos ({cobertura}%)
        </strong>{' '}
        quedaron con productos, {num(d.productosDistintos)} artículos distintos.
        {d.columnaDocumento && (
          <>
            {' '}
            Columnas: documento <code className="mono">{d.columnaDocumento}</code>
            {d.columnaCantidad && (
              <>
                , cantidad <code className="mono">{d.columnaCantidad}</code>
              </>
            )}
            {d.origenNombre === 'columna' && d.columnaDescripcion ? (
              <>
                , producto <code className="mono">{d.columnaDescripcion}</code>
              </>
            ) : d.origenNombre === 'grupo' ? (
              <>; el nombre del producto se tomó de los encabezados de grupo</>
            ) : null}
            .
          </>
        )}
        {d.avisos.map((a) => (
          <span key={a} style={{ display: 'block', marginTop: 4 }}>
            {a}
          </span>
        ))}
      </span>
    </div>
  );
}
