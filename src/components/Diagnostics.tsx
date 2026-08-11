import { moneyExact, num } from '../lib/format';
import { ROLE_LABEL, type Diagnostics } from '../lib/types';

export function DiagnosticsPanel({ diag, onSheetChange }: { diag: Diagnostics; onSheetChange: (s: string) => void }) {
  const reconOk = diag.reconciliation.length > 0 && diag.reconciliation.every((r) => r.ok);
  const estado = reconOk ? 'ok' : diag.reconciliation.length > 0 ? 'bad' : 'warn';
  const etiqueta = reconOk
    ? 'Cuadra con los totales del archivo'
    : diag.reconciliation.length > 0
      ? 'No cuadra con los totales del archivo'
      : 'Sin totales para verificar';

  return (
    <details className="diag">
      <summary>
        <span>Cómo se leyó el archivo</span>
        <span className={`status ${estado}`}>
          {estado === 'ok' ? '✓' : estado === 'bad' ? '✕' : '!'} {etiqueta}
        </span>
      </summary>
      <div className="diag-body">
        {diag.warnings.map((w) => (
          <div className="alert warn" key={w}>
            <span aria-hidden>⚠</span>
            <span>{w}</span>
          </div>
        ))}
        {reconOk && (
          <div className="alert ok">
            <span aria-hidden>✓</span>
            <span>
              La suma de los documentos leídos coincide exactamente con la fila «Totales» del propio reporte. Los
              números del dashboard son los del archivo.
            </span>
          </div>
        )}

        <div className="diag-grid" style={{ marginTop: 14 }}>
          <div>
            <h4 className="section-title">Origen</h4>
            <p className="section-sub">Hoja elegida y cómo se clasificó cada fila.</p>
            <div className="kv">
              <span>Archivo</span>
              <span>{diag.fileName}</span>
            </div>
            <div className="kv">
              <span>Hoja</span>
              <span>
                <select
                  value={diag.sheetName}
                  onChange={(e) => onSheetChange(e.target.value)}
                  style={{ fontSize: 12.5, padding: '2px 6px' }}
                >
                  {diag.sheetScores.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} ({s.reason})
                    </option>
                  ))}
                </select>
              </span>
            </div>
            <div className="kv">
              <span>Formato detectado</span>
              <span>{diag.layout === 'agrupada' ? 'Reporte agrupado por cliente' : 'Tabla plana'}</span>
            </div>
            <div className="kv">
              <span>Catálogo de vendedores</span>
              <span>
                {diag.catalogoVendedores
                  ? `hoja «${diag.catalogoVendedores.hoja}» (${diag.catalogoVendedores.entradas})`
                  : 'catálogo interno de la app'}
              </span>
            </div>
            <div className="kv">
              <span>Filas totales</span>
              <span>{num(diag.rowCounts.total)}</span>
            </div>
            <div className="kv">
              <span>· de detalle (usadas)</span>
              <span>{num(diag.rowCounts.detalle)}</span>
            </div>
            <div className="kv">
              <span>· encabezados de cliente</span>
              <span>{num(diag.rowCounts.grupo)}</span>
            </div>
            <div className="kv">
              <span>· de totales (descartadas)</span>
              <span>{num(diag.rowCounts.totales)}</span>
            </div>
            <div className="kv">
              <span>· notas al pie y vacías</span>
              <span>{num(diag.rowCounts.ruido + diag.rowCounts.vacia + diag.rowCounts.encabezado)}</span>
            </div>
          </div>

          <div>
            <h4 className="section-title">Reconciliación</h4>
            <p className="section-sub">Lo calculado contra los totales que trae el archivo.</p>
            {diag.reconciliation.length === 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                El archivo no incluye una fila de totales, así que no hay contra qué verificar.
              </p>
            )}
            {diag.reconciliation.map((r) => (
              <div key={r.label} style={{ marginBottom: 10 }}>
                <div className={`status ${r.ok ? 'ok' : 'bad'}`} style={{ marginBottom: 2 }}>
                  {r.ok ? '✓' : '✕'} {r.label}
                </div>
                <div className="kv">
                  <span>Total en el reporte</span>
                  <span>{moneyExact(r.reportado)}</span>
                </div>
                <div className="kv">
                  <span>Suma calculada</span>
                  <span>{moneyExact(r.calculado)}</span>
                </div>
                <div className="kv">
                  <span>Diferencia</span>
                  <span className={r.ok ? '' : 'neg'}>{moneyExact(r.delta)}</span>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h4 className="section-title">Mapeo de columnas</h4>
            <p className="section-sub">
              Deducido por la forma de los valores, no por el título{diag.headerOffset !== 0 ? ' (los títulos venían corridos)' : ''}.
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Col</th>
                    <th>Se leyó como</th>
                    <th>Por qué</th>
                  </tr>
                </thead>
                <tbody>
                  {diag.mapping.map((m) => (
                    <tr key={m.index}>
                      <td>
                        <code className="mono">{m.columnLetter}</code>
                      </td>
                      <td>{ROLE_LABEL[m.role]}</td>
                      <td style={{ whiteSpace: 'normal', color: 'var(--text-secondary)' }}>{m.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {diag.unmappedRoles.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                Sin columna equivalente en este archivo: {diag.unmappedRoles.map((r) => ROLE_LABEL[r]).join(', ')}.
              </p>
            )}
          </div>
        </div>

        {diag.descartadas.length > 0 && (
          <details style={{ marginTop: 18 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
              Ver las {num(diag.descartadas.length)} filas descartadas
            </summary>
            <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto', marginTop: 10 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Motivo</th>
                    <th>Contenido</th>
                  </tr>
                </thead>
                <tbody>
                  {diag.descartadas.map((d) => (
                    <tr key={`${d.fila}-${d.motivo}`}>
                      <td>{d.fila}</td>
                      <td>{d.motivo}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{d.contenido}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
