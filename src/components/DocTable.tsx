import { useMemo, useState } from 'react';
import { CeldaProductos } from './CeldaProductos';
import { fecha, moneyExact, num } from '../lib/format';
import { BUCKET_COLOR, type EnrichedDoc } from '../lib/metrics';

type Key =
  | 'clienteNombre'
  | 'tipoDoc'
  | 'numero'
  | 'emision'
  | 'productos'
  | 'dias'
  | 'vendedorNombre'
  | 'neto'
  | 'abonado'
  | 'saldo';

const COLS: { key: Key; label: string; num?: boolean }[] = [
  { key: 'clienteNombre', label: 'Cliente' },
  { key: 'tipoDoc', label: 'Tipo' },
  { key: 'numero', label: 'Documento' },
  { key: 'emision', label: 'Emisión' },
  { key: 'productos', label: 'Productos' },
  { key: 'dias', label: 'Días', num: true },
  { key: 'vendedorNombre', label: 'Vendedor' },
  { key: 'neto', label: 'Monto original', num: true },
  { key: 'abonado', label: 'Abonado', num: true },
  { key: 'saldo', label: 'Saldo', num: true },
];

const PAGE = 40;

export function DocTable({ docs }: { docs: EnrichedDoc[] }) {
  const [sortKey, setSortKey] = useState<Key>('saldo');
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const val = (d: EnrichedDoc): string | number => {
      const v = d[sortKey];
      if (v instanceof Date) return v.getTime();
      if (Array.isArray(v)) return v.join(' ');
      if (v === null || v === undefined) return asc ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      return v as string | number;
    };
    return [...docs].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
      return asc ? c : -c;
    });
  }, [docs, sortKey, asc]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * PAGE, current * PAGE + PAGE);

  const toggle = (k: Key) => {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(false);
    }
    setPage(0);
  };

  return (
    <>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? 'num' : undefined}
                  onClick={() => toggle(c.key)}
                  aria-sort={sortKey === c.key ? (asc ? 'ascending' : 'descending') : 'none'}
                >
                  {c.label}
                  {sortKey === c.key ? (asc ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((d, i) => (
              <tr key={`${d.numero}-${d.clienteNombre}-${i}`}>
                {/* Sin recorte en JS: en pantalla lo acorta el CSS y al imprimir
                    el nombre completo envuelve en dos líneas. */}
                <td className="celda-cliente" title={d.clienteNombre}>
                  {d.clienteNombre}
                </td>
                <td>{d.tipoDoc}</td>
                <td>{d.numero || '—'}</td>
                <td>{fecha(d.emision)}</td>
                <CeldaProductos productos={d.productos} />
                <td className="num">
                  <span className="badge" style={{ background: BUCKET_COLOR[d.bucket] }} title={d.bucket}>
                    {d.dias === null ? '—' : d.dias <= 0 ? 'al día' : d.dias}
                  </span>
                </td>
                <td title={`Código ${d.vendedor}`}>{d.vendedorNombre}</td>
                <td className="num">{moneyExact(d.neto)}</td>
                {/* Un abono negativo es real (anticipos consumidos): se muestra,
                    no se esconde tras un guion. */}
                <td className={`num${d.abonado < 0 ? ' neg' : ''}`}>
                  {d.abonado !== 0 ? moneyExact(d.abonado) : '—'}
                </td>
                <td className={`num${d.saldo < 0 ? ' neg' : ''}`} style={{ fontWeight: 600 }}>
                  {moneyExact(d.saldo)}
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={COLS.length} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                  Ningún documento coincide con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button className="btn" onClick={() => setPage(current - 1)} disabled={current === 0}>
            Anterior
          </button>
          <span>
            {current * PAGE + 1}–{Math.min((current + 1) * PAGE, sorted.length)} de {num(sorted.length)}
          </span>
          <button className="btn" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>
            Siguiente
          </button>
        </div>
      )}
    </>
  );
}
