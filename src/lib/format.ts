const LOCALE = 'es-VE';

export const money = (n: number, moneda = 'USD'): string =>
  `${moneda === 'USD' ? '$' : ''}${n.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const moneyExact = (n: number): string =>
  n.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const compact = (n: number): string => {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
};

/** Coma decimal, para no mezclar estilos con los montos en es-VE. */
export const pct = (n: number, dec = 1): string =>
  `${n.toLocaleString(LOCALE, { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;

export const num = (n: number): string => n.toLocaleString(LOCALE);

export const fecha = (d: Date | null): string => {
  if (!d) return '—';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
};

export const fechaISO = (d: Date): string => d.toISOString().slice(0, 10);
