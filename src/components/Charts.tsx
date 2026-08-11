import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { compact, money, num, pct } from '../lib/format';
import { BUCKET_COLOR, type BucketRow, type ClienteRow, type MesRow, type VendedorRow } from '../lib/metrics';

const SERIES_1 = '#2a78d6';
const SERIES_2 = '#eb6834';
const GRID = '#e1e0d9';
const AXIS = '#c3c2b7';
const MUTED = '#898781';

const axisTick = { fill: MUTED, fontSize: 11.5 };
const gridProps = { stroke: GRID, strokeDasharray: '0', vertical: false } as const;

interface TipRow {
  label: string;
  value: string;
}

function Tip({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="tooltip">
      <div className="t-title">{title}</div>
      {rows.map((r) => (
        <div className="t-row" key={r.label}>
          <span>{r.label}</span>
          <b>{r.value}</b>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  sub,
  legend,
  tall,
  children,
}: {
  title: string;
  sub: string;
  legend?: { color: string; label: string }[];
  tall?: boolean;
  children: React.ReactElement;
}) {
  return (
    <section className="card">
      <h3 className="section-title">{title}</h3>
      <p className="section-sub">{sub}</p>
      {legend && (
        <div className="legend">
          {legend.map((l) => (
            <span key={l.label}>
              <i style={{ background: l.color }} aria-hidden />
              {l.label}
            </span>
          ))}
        </div>
      )}
      <div className={`chart-body${tall ? ' tall' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Antigüedad de saldos: rampa de un solo tono, más oscuro = más vencido. */
export function AgingChart({ data }: { data: BucketRow[] }) {
  return (
    <Panel
      title="Antigüedad de saldos"
      sub="Cuánto dinero lleva cuánto tiempo sin cobrarse. El tono se oscurece con el atraso."
    >
      <BarChart data={data} margin={{ top: 24, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="bucket" tick={axisTick} axisLine={{ stroke: AXIS }} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={54}
          tickFormatter={(v: number) => compact(v)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(11,11,11,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as BucketRow;
            return (
              <Tip
                title={`${d.bucket} días de atraso`}
                rows={[
                  { label: 'Saldo', value: money(d.saldo) },
                  { label: 'Documentos', value: num(d.docs) },
                  { label: 'Participación', value: pct(d.pct) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="saldo" radius={[4, 4, 0, 0]} maxBarSize={78} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.bucket} fill={BUCKET_COLOR[d.bucket]} />
          ))}
          <LabelList
            dataKey="saldo"
            position="top"
            offset={8}
            formatter={(v: unknown) => compact(Number(v))}
            style={{ fill: '#52514e', fontSize: 11.5, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </Panel>
  );
}

export function TopClientesChart({ data }: { data: ClienteRow[] }) {
  // Se recorta a una sola línea: si el texto envuelve, las etiquetas chocan entre sí.
  // El nombre completo sigue disponible en el tooltip y en la tabla de detalle.
  const rows = data.slice(0, 12).map((r) => ({
    ...r,
    corto: r.cliente.length > 21 ? `${r.cliente.slice(0, 20)}…` : r.cliente,
  }));
  return (
    <Panel
      title="Mayores deudores"
      sub="Los 12 clientes que concentran más saldo pendiente."
      tall
    >
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 4 }} barCategoryGap={4}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v)} />
        <YAxis
          type="category"
          dataKey="corto"
          tick={axisTick}
          axisLine={{ stroke: AXIS }}
          tickLine={false}
          width={172}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: 'rgba(11,11,11,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as ClienteRow;
            return (
              <Tip
                title={d.cliente}
                rows={[
                  { label: 'Saldo', value: money(d.saldo) },
                  { label: 'Vencido', value: money(d.vencido) },
                  { label: 'Documentos', value: num(d.docs) },
                  { label: 'Atraso máximo', value: `${d.maxDias} días` },
                  { label: 'Participación', value: pct(d.pct) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="saldo" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
          <LabelList
            dataKey="saldo"
            position="right"
            offset={7}
            formatter={(v: unknown) => compact(Number(v))}
            style={{ fill: '#52514e', fontSize: 11, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </Panel>
  );
}

export function MesChart({ data }: { data: MesRow[] }) {
  return (
    <Panel
      title="Cartera por mes de emisión"
      sub="Del monto facturado en cada mes, cuánto sigue sin cobrarse."
      legend={[
        { color: SERIES_1, label: 'Monto original' },
        { color: SERIES_2, label: 'Saldo pendiente' },
      ]}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }} barGap={2}>
        <CartesianGrid {...gridProps} />
        {/* tickMargin separa las etiquetas rotadas del eje: sin él la primera choca
            con el valor más bajo del eje Y cuando la escala baja de cero. */}
        <XAxis
          dataKey="etiqueta"
          tick={axisTick}
          axisLine={{ stroke: AXIS }}
          tickLine={false}
          interval={0}
          angle={-32}
          textAnchor="end"
          tickMargin={12}
          height={64}
        />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={54} tickFormatter={(v: number) => compact(v)} />
        <Tooltip
          cursor={{ fill: 'rgba(11,11,11,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as MesRow;
            const cobrado = d.neto - d.saldo;
            return (
              <Tip
                title={d.etiqueta}
                rows={[
                  { label: 'Monto original', value: money(d.neto) },
                  { label: 'Saldo pendiente', value: money(d.saldo) },
                  { label: 'Ya abonado', value: money(cobrado) },
                  { label: 'Documentos', value: num(d.docs) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="neto" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
        <Bar dataKey="saldo" fill={SERIES_2} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
      </BarChart>
    </Panel>
  );
}

export function VendedorChart({ data }: { data: VendedorRow[] }) {
  return (
    <Panel title="Cartera por vendedor" sub="Saldo pendiente asignado a cada vendedor." tall>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 4 }} barCategoryGap={4}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: number) => compact(v)} />
        <YAxis
          type="category"
          dataKey="vendedor"
          tick={axisTick}
          axisLine={{ stroke: AXIS }}
          tickLine={false}
          width={92}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: 'rgba(11,11,11,0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as VendedorRow;
            return (
              <Tip
                title={d.vendedor}
                rows={[
                  { label: d.codigos.length > 1 ? 'Códigos' : 'Código', value: d.codigos.join(', ') },
                  { label: 'Saldo', value: money(d.saldo) },
                  { label: 'Vencido', value: `${money(d.vencido)} (${pct(d.pctVencido, 0)})` },
                  { label: 'Documentos', value: num(d.docs) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="saldo" fill={SERIES_1} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
          <LabelList
            dataKey="saldo"
            position="right"
            offset={7}
            formatter={(v: unknown) => compact(Number(v))}
            style={{ fill: '#52514e', fontSize: 11, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </Panel>
  );
}
