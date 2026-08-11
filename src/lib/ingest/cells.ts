/** Utilidades de bajo nivel para inspeccionar celdas crudas de una hoja. */

export type Cell = unknown;
export type Row = Cell[];

export const isBlank = (c: Cell): boolean =>
  c === null || c === undefined || (typeof c === 'string' && c.trim() === '');

export const isDate = (c: Cell): c is Date =>
  c instanceof Date && !Number.isNaN(c.getTime());

export const isNum = (c: Cell): c is number =>
  typeof c === 'number' && Number.isFinite(c);

export const text = (c: Cell): string =>
  isBlank(c) ? '' : String(c).replace(/\s+/g, ' ').trim();

/** Normaliza para comparar encabezados: sin acentos, minúsculas, sin puntuación. */
export const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const density = (r: Row): number => r.reduce<number>((n, c) => n + (isBlank(c) ? 0 : 1), 0);

export const colLetter = (i: number): string => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

/** Convierte un serial de fecha de Excel a Date (solo si cae en un rango plausible). */
export function excelSerialToDate(n: number): Date | null {
  if (!Number.isFinite(n) || n < 20000 || n > 60000) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDate(c: Cell): Date | null {
  if (isDate(c)) return c;
  if (isNum(c)) return excelSerialToDate(c);
  if (typeof c === 'string') {
    const m = c.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (m) {
      const [, a, b, y] = m;
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      // Formato local (Venezuela): dd/mm/aaaa
      const d = new Date(Date.UTC(year, Number(b) - 1, Number(a)));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/** Interpreta montos con formato local: "1.234,56" o "1,234.56" o "(500)". */
export function toNumber(c: Cell): number | null {
  if (isNum(c)) return c;
  if (typeof c !== 'string') return null;
  let s = c.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,\-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export const DOC_VOCAB = new Set([
  'fact',
  'factura',
  'f',
  'ncr',
  'n cr',
  'nc',
  'nota de credito',
  'ndb',
  'n db',
  'nd',
  'nota de debito',
  'adel',
  'adelanto',
  'anticipo',
  'rec',
  'recibo',
  'gir',
  'giro',
  'chq',
  'cheque',
  'dev',
  'devolucion',
]);

export const CURRENCY_VOCAB = new Set([
  'usd',
  'ves',
  'vef',
  'bs',
  'bsd',
  'bss',
  'eur',
  'cop',
  'pen',
  'clp',
  'mxn',
  'ars',
  'brl',
  'dolar',
  'dolares',
  'bolivares',
]);

/** Tipos de documento que restan cartera (notas de crédito, anticipos). */
export const CREDIT_DOCS = new Set(['ncr', 'nc', 'nota de credito', 'adel', 'adelanto', 'anticipo', 'dev', 'devolucion']);

export const isTotalText = (s: string): boolean =>
  /^(sub)?\s*totale?s?\b/.test(norm(s)) || /^gran total/.test(norm(s));

export const isGrandTotalText = (s: string): boolean => {
  const n = norm(s);
  return /^(gran )?totale?s?\b/.test(n) && !/cliente|vendedor|grupo|parcial/.test(n);
};
