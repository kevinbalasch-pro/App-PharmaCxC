export const GRAFICOS = [
  { id: 'antiguedad', etiqueta: 'Antigüedad de saldos' },
  { id: 'meses', etiqueta: 'Cartera por mes' },
  { id: 'clientes', etiqueta: 'Mayores deudores' },
  { id: 'vendedores', etiqueta: 'Cartera por vendedor' },
] as const;

export type GraficoId = (typeof GRAFICOS)[number]['id'];

export const TODOS_VISIBLES: GraficoId[] = GRAFICOS.map((g) => g.id);

interface Props {
  visibles: GraficoId[];
  onChange: (v: GraficoId[]) => void;
}

/**
 * Un interruptor por gráfico. Lo oculto no se renderiza, así que tampoco
 * aparece al guardar el PDF.
 */
export function ChartToggles({ visibles, onChange }: Props) {
  const alternar = (id: GraficoId) =>
    onChange(visibles.includes(id) ? visibles.filter((x) => x !== id) : [...visibles, id]);

  const todos = visibles.length === GRAFICOS.length;

  return (
    <div className="card graficos-barra no-print">
      <span className="graficos-titulo">Gráficos</span>
      <div className="chip-row">
        {GRAFICOS.map((g) => {
          const activo = visibles.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              className="chip"
              aria-pressed={activo}
              onClick={() => alternar(g.id)}
              title={activo ? `Ocultar ${g.etiqueta}` : `Mostrar ${g.etiqueta}`}
            >
              <span aria-hidden style={{ marginRight: 5 }}>
                {activo ? '◉' : '○'}
              </span>
              {g.etiqueta}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onChange(todos ? [] : TODOS_VISIBLES)}
      >
        {todos ? 'Ocultar todos' : 'Mostrar todos'}
      </button>
    </div>
  );
}
