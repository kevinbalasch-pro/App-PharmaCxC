import { money, num, pct } from '../lib/format';
import type { Kpis } from '../lib/metrics';

interface CardProps {
  label: string;
  value: string;
  note?: string;
  /** Color de estado: se acompaña siempre de texto, nunca informa por sí solo. */
  tone?: 'good' | 'warning' | 'serious' | 'critical';
}

function Card({ label, value, note, tone }: CardProps) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {note && (
        <div className="kpi-note">
          {tone && <i className="dot" style={{ background: `var(--${tone})` }} aria-hidden />}
          <span>{note}</span>
        </div>
      )}
    </div>
  );
}

export function KpiRow({ k }: { k: Kpis }) {
  return (
    <div className="kpi-grid">
      <Card
        label="Cartera total"
        value={money(k.carteraTotal)}
        note={`${num(k.documentos)} documentos · ${num(k.clientes)} clientes`}
      />
      <Card
        label="Vencido +90 días"
        value={money(k.saldoCritico)}
        note={
          k.carteraTotal > 0
            ? `${pct((k.saldoCritico / k.carteraTotal) * 100)} de la cartera · riesgo alto`
            : 'sin datos'
        }
        tone={k.carteraTotal > 0 && k.saldoCritico / k.carteraTotal >= 0.15 ? 'critical' : 'warning'}
      />
      <Card
        label="Antigüedad promedio"
        value={`${Math.round(k.antiguedadPromedio)} días`}
        note="ponderada por monto"
      />
      <Card
        label="Ya abonado"
        value={money(k.abonado)}
        note={`${pct(k.pctRecuperado)} del monto original facturado`}
      />
      <Card
        label="Concentración top 10"
        value={pct(k.concentracionTop10, 0)}
        note={
          k.concentracionTop10 >= 60
            ? 'cartera muy concentrada'
            : k.concentracionTop10 >= 40
              ? 'concentración moderada'
              : 'cartera diversificada'
        }
        tone={k.concentracionTop10 >= 60 ? 'serious' : k.concentracionTop10 >= 40 ? 'warning' : 'good'}
      />
    </div>
  );
}
