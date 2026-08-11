import { useEffect, useMemo, useRef, useState } from 'react';

export interface Opcion {
  valor: string;
  /** Texto secundario alineado a la derecha (por ejemplo el saldo). */
  detalle?: string;
}

interface Props {
  etiqueta: string;
  opciones: Opcion[];
  seleccion: string[];
  onChange: (s: string[]) => void;
  /** Texto del botón cuando no hay nada seleccionado. */
  vacio: string;
  buscarPlaceholder?: string;
}

/**
 * Filtro por casillas al estilo de Excel: un botón que abre un panel con
 * buscador interno y lista marcable. Selección vacía significa «todos».
 */
export function MultiSelect({ etiqueta, opciones, seleccion, onChange, vacio, buscarPlaceholder }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const cont = useRef<HTMLDivElement>(null);
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    buscador.current?.focus();
    const fuera = (e: MouseEvent) => {
      if (cont.current && !cont.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? opciones.filter((o) => o.valor.toLowerCase().includes(t)) : opciones;
  }, [opciones, q]);

  const marcado = (v: string) => seleccion.includes(v);
  const alternar = (v: string) => onChange(marcado(v) ? seleccion.filter((x) => x !== v) : [...seleccion, v]);

  const texto =
    seleccion.length === 0
      ? vacio
      : seleccion.length === 1
        ? seleccion[0]
        : `${seleccion.length} seleccionados`;

  return (
    <div className="field" ref={cont} style={{ position: 'relative' }}>
      <label>{etiqueta}</label>
      <button
        type="button"
        className={`ms-trigger${seleccion.length ? ' activo' : ''}`}
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="listbox"
        title={seleccion.length > 1 ? seleccion.join(', ') : undefined}
      >
        <span className="ms-texto">{texto}</span>
        <span aria-hidden>▾</span>
      </button>

      {abierto && (
        <div className="ms-panel" role="listbox" aria-label={etiqueta}>
          <input
            ref={buscador}
            type="search"
            className="ms-buscar"
            placeholder={buscarPlaceholder ?? 'Buscar…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="ms-acciones">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange([...new Set([...seleccion, ...visibles.map((o) => o.valor)])])}
            >
              Marcar {q.trim() ? 'lo visible' : 'todo'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onChange([])} disabled={!seleccion.length}>
              Limpiar
            </button>
          </div>
          <div className="ms-lista">
            {visibles.map((o) => (
              <label key={o.valor} className="ms-item">
                <input type="checkbox" checked={marcado(o.valor)} onChange={() => alternar(o.valor)} />
                <span className="ms-nombre" title={o.valor}>
                  {o.valor}
                </span>
                {o.detalle && <span className="ms-detalle">{o.detalle}</span>}
              </label>
            ))}
            {visibles.length === 0 && <p className="ms-vacio">Sin coincidencias</p>}
          </div>
          <div className="ms-pie">
            {seleccion.length === 0
              ? `${opciones.length} disponibles · ninguno filtra igual que todos`
              : `${seleccion.length} de ${opciones.length} seleccionados`}
          </div>
        </div>
      )}
    </div>
  );
}
