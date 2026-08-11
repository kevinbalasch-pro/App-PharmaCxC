import { useRef, useState, type DragEvent } from 'react';

interface Props {
  onFile: (file: File) => void;
  error?: string | null;
  busy?: boolean;
}

export function FileDrop({ onFile, error, busy }: Props) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div className="drop">
      <div
        className={`drop-inner${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
      >
        <h2>Dashboard de Cuentas por Cobrar</h2>
        <p>
          Arrastra aquí el reporte de Excel (<code className="mono">.xls</code>, <code className="mono">.xlsx</code>,{' '}
          <code className="mono">.csv</code>). La app detecta sola la hoja, las columnas y las filas de totales.
        </p>
        <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? 'Procesando…' : 'Seleccionar archivo'}
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
        {error && (
          <div className="alert warn" style={{ marginTop: 20, textAlign: 'left' }}>
            <span>⚠</span>
            <span>{error}</span>
          </div>
        )}
        <p style={{ marginTop: 22, marginBottom: 0, fontSize: 12, color: 'var(--text-muted)' }}>
          El archivo se procesa en tu navegador. No se sube a ningún servidor.
        </p>
      </div>
    </div>
  );
}
