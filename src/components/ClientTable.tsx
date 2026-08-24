import { useMemo, useState } from 'react';
import { CeldaProductos } from './CeldaProductos';
import { fecha, moneyExact, num, pct } from '../lib/format';
import { BUCKET_COLOR, porCliente, type ClienteRow, type EnrichedDoc } from '../lib/metrics';

type Key = 'cliente' | 'docs' | 'neto' | 'abonado' | 'saldo' | 'maxDias' | 'pct';

// El saldo va en la última columna a propósito: es la cifra que se busca, y en
// la fila de totales conviene que sea lo último que lee el ojo. El porcentaje,
// que en el total siempre es 100%, se aparta a su izquierda.
const COLS: { key: Key; label: string; num?: boolean }[] = [
  { key: 'cliente', label: 'Cliente' },
  { key: 'docs', label: 'Docs.', num: true },
  { key: 'maxDias', label: 'Atraso máx.', num: true },
  { key: 'neto', label: 'Monto original', num: true },
  { key: 'abonado', label: 'Abonado', num: true },
  { key: 'pct', label: '% cartera', num: true },
  { key: 'saldo', label: 'Saldo', num: true },
];

interface Props {
  docs: EnrichedDoc[];
  /** Clientes desplegados. Lo controla TableSection para poder abrirlos todos. */
  abiertos: string[];
  onAbiertos: (a: string[]) => void;
}

export function ClientTable({ docs, abiertos, onAbiertos }: Props) {
  const [sortKey, setSortKey] = useState<Key>('saldo');
  const [asc, setAsc] = useState(false);

  const filas = useMemo(() => porCliente(docs), [docs]);

  const porNombre = useMemo(() => {
    const m = new Map<string, EnrichedDoc[]>();
    for (const d of docs) m.set(d.clienteNombre, [...(m.get(d.clienteNombre) ?? []), d]);
    for (const v of m.values()) v.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
    return m;
  }, [docs]);

  const ordenadas = useMemo(() => {
    const val = (r: ClienteRow): string | number => r[sortKey];
    return [...filas].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y), 'es') : x - y;
      return asc ? c : -c;
    });
  }, [filas, sortKey, asc]);

  const toggleOrden = (k: Key) => {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(k === 'cliente');
    }
  };

  const toggleFila = (c: string) =>
    onAbiertos(abiertos.includes(c) ? abiertos.filter((x) => x !== c) : [...abiertos, c]);

  const totales = filas.reduce(
    (a, r) => ({ docs: a.docs + r.docs, neto: a.neto + r.neto, abonado: a.abonado + r.abonado, saldo: a.saldo + r.saldo }),
    { docs: 0, neto: 0, abonado: 0, saldo: 0 },
  );

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 26 }} aria-label="Expandir" />
            {COLS.map((c) => (
              <th
                key={c.key}
                className={c.num ? 'num' : undefined}
                onClick={() => toggleOrden(c.key)}
                aria-sort={sortKey === c.key ? (asc ? 'ascending' : 'descending') : 'none'}
              >
                {c.label}
                {sortKey === c.key ? (asc ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        {ordenadas.map((r) => {
            const abierto = abiertos.includes(r.cliente);
            // Un tbody por cliente: el navegador lo trata como un bloque al
            // paginar, así el nombre no se queda solo al pie de una hoja.
            return (
              <tbody key={r.cliente} className="grupo-cliente">
                <tr className="fila-cliente" onClick={() => toggleFila(r.cliente)}>
                  <td className="expandir">
                    <button
                      type="button"
                      aria-expanded={abierto}
                      aria-label={`${abierto ? 'Ocultar' : 'Ver'} documentos de ${r.cliente}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFila(r.cliente);
                      }}
                    >
                      {abierto ? '▾' : '▸'}
                    </button>
                  </td>
                  <td
                    className="celda-cliente"
                    title={`${r.cliente}${r.codigo ? ` · ${r.codigo}` : ''} · ${r.vendedores.join(', ')}`}
                  >
                    {r.cliente}
                  </td>
                  {/* Desplegado, los totales del cliente se repetirían aquí y al
                      pie de su detalle. Se dejan solo abajo, junto a lo que suman. */}
                  {abierto ? (
                    <td colSpan={COLS.length - 1} />
                  ) : (
                    <>
                      <td className="num">{r.docs}</td>
                      <td className="num">
                        <span
                          className="badge"
                          style={{ background: BUCKET_COLOR[r.peorBucket] }}
                          title={`Tramo ${r.peorBucket} días`}
                        >
                          {r.maxDias <= 0 ? 'al día' : r.maxDias}
                        </span>
                      </td>
                      <td className="num">{moneyExact(r.neto)}</td>
                      <td className={`num${r.abonado < 0 ? ' neg' : ''}`}>
                        {r.abonado !== 0 ? moneyExact(r.abonado) : '—'}
                      </td>
                      <td className="num">{pct(r.pct)}</td>
                      <td className={`num${r.saldo < 0 ? ' neg' : ''}`} style={{ fontWeight: 650 }}>
                        {moneyExact(r.saldo)}
                      </td>
                    </>
                  )}
                </tr>
                {abierto && (
                  <tr className="fila-detalle">
                    <td />
                    <td colSpan={COLS.length}>
                      <table className="data sub">
                        <thead>
                          <tr>
                            <th>Tipo</th>
                            <th>Documento</th>
                            <th>Emisión</th>
                            <th>Productos</th>
                            <th className="num">Días</th>
                            <th>Vendedor</th>
                            <th className="num">Monto original</th>
                            <th className="num">Abonado</th>
                            <th className="num">Saldo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(porNombre.get(r.cliente) ?? []).map((d, i) => (
                            <tr key={`${d.numero}-${i}`}>
                              <td>{d.tipoDoc}</td>
                              <td>{d.numero || '—'}</td>
                              <td>{fecha(d.emision)}</td>
                              <CeldaProductos productos={d.productos} vertical />
                              <td className="num">
                                <span className="badge" style={{ background: BUCKET_COLOR[d.bucket] }}>
                                  {d.dias === null ? '—' : d.dias <= 0 ? 'al día' : d.dias}
                                </span>
                              </td>
                              <td>{d.vendedorNombre}</td>
                              <td className="num">{moneyExact(d.neto)}</td>
                              <td className={`num${d.abonado < 0 ? ' neg' : ''}`}>{d.abonado !== 0 ? moneyExact(d.abonado) : '—'}</td>
                              <td className={`num${d.saldo < 0 ? ' neg' : ''}`}>{moneyExact(d.saldo)}</td>
                            </tr>
                          ))}
                        </tbody>
                        {/* El total va bajo el último documento y en las mismas
                            columnas, para poder cuadrarlo leyendo hacia abajo. */}
                        <tfoot>
                          <tr>
                            <td colSpan={6}>
                              Total de {r.cliente} · {r.docs} {r.docs === 1 ? 'documento' : 'documentos'}
                            </td>
                            <td className="num">{moneyExact(r.neto)}</td>
                            <td className={`num${r.abonado < 0 ? ' neg' : ''}`}>{r.abonado !== 0 ? moneyExact(r.abonado) : '—'}</td>
                            <td className={`num${r.saldo < 0 ? ' neg' : ''}`}>{moneyExact(r.saldo)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        {ordenadas.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={COLS.length + 1} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                Ningún cliente coincide con los filtros.
              </td>
            </tr>
          </tbody>
        )}
        {ordenadas.length > 0 && (
          <tfoot>
            <tr>
              <td />
              <td>
                <strong>{num(ordenadas.length)} clientes</strong>
              </td>
              <td className="num">
                <strong>{totales.docs}</strong>
              </td>
              <td />
              {/* Los tres importes van pegados al borde derecho, como en la fila
                  de total de cada cliente desplegado. El porcentaje se omite:
                  en el total general siempre vale 100%. */}
              <td />
              <td className="num">
                <strong>{moneyExact(totales.neto)}</strong>
              </td>
              <td className="num">
                <strong>{moneyExact(totales.abonado)}</strong>
              </td>
              <td className="num">
                <strong>{moneyExact(totales.saldo)}</strong>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
