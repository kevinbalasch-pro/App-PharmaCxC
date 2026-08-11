import { density, isBlank, isDate, isNum, isTotalText, norm, text, toDate, toNumber, type Row } from './cells';

export type RowKind = 'detalle' | 'grupo' | 'total' | 'encabezado' | 'ruido' | 'vacia';

export interface ClassifiedRow {
  index: number;
  kind: RowKind;
  row: Row;
}

const HEADER_WORDS = [
  'tipo',
  'doc',
  'numero',
  'emision',
  'vencim',
  'vence',
  'cliente',
  'saldo',
  'neto',
  'monto',
  'total',
  'vend',
  'moneda',
  'tasa',
  'observ',
  'fecha',
  'codigo',
  'factura',
  'referencia',
  'importe',
  'abono',
  // Vocabulario del archivo de productos. Se eligen palabras largas y
  // distintivas: "cant" como fragmento marcaría por error a un cliente
  // llamado "CANTERA".
  'descrip',
  'producto',
  'articulo',
  'cantidad',
  'precio',
  'unidad',
];

const looksLikeHeader = (r: Row): boolean => {
  const cells = r.filter((c) => !isBlank(c));
  if (cells.length < 2) return false;
  if (cells.some((c) => isDate(c) || isNum(c))) return false;
  const hits = cells.filter((c) => {
    const n = norm(text(c));
    return HEADER_WORDS.some((w) => n.includes(w));
  }).length;
  // Se exigen dos aciertos, no solo la mitad: una fila de dos celdas como
  // ["10648", "VENDA DE SILICON"] acertaría el 50% por "vend" dentro de
  // "VENDA" y se tomaría por encabezado. Un encabezado real nombra varias
  // columnas; un nombre propio, como mucho, colisiona con una palabra.
  return hits >= 2 && hits / cells.length >= 0.5;
};

const hasSignal = (r: Row): boolean =>
  r.some((c) => toDate(c) !== null) || r.some((c) => isNum(c) && Math.abs(c) > 0);

/**
 * Clasifica cada fila sin mirar los encabezados: la forma de la fila es la señal.
 * Las filas de detalle comparten una densidad dominante; los encabezados de grupo
 * de un reporte agrupado son mucho más dispersos.
 */
export function classifyRows(rows: Row[]): { rows: ClassifiedRow[]; dominantDensity: number } {
  const pre = rows.map((row, index) => {
    if (density(row) === 0) return { index, row, kind: 'vacia' as RowKind };
    const nonBlank = row.filter((c) => !isBlank(c));
    if (nonBlank.some((c) => typeof c === 'string' && isTotalText(c))) {
      return { index, row, kind: 'total' as RowKind };
    }
    if (nonBlank.length === 1 && text(nonBlank[0]).length > 30) {
      return { index, row, kind: 'ruido' as RowKind };
    }
    if (looksLikeHeader(row)) return { index, row, kind: 'encabezado' as RowKind };
    return { index, row, kind: null };
  });

  const candidates = pre.filter((p) => p.kind === null);
  const hist = new Map<number, number>();
  for (const c of candidates) {
    const d = density(c.row);
    hist.set(d, (hist.get(d) ?? 0) + 1);
  }
  let dominantDensity = 0;
  let best = -1;
  for (const [d, n] of hist) {
    // Ante empates, la densidad mayor gana: las filas de detalle llevan más campos.
    if (n > best || (n === best && d > dominantDensity)) {
      best = n;
      dominantDensity = d;
    }
  }

  const threshold = Math.max(2, Math.ceil(dominantDensity * 0.6));
  const out: ClassifiedRow[] = pre.map((p) => {
    if (p.kind !== null) return p as ClassifiedRow;
    const d = density(p.row);
    const kind: RowKind = d >= threshold && hasSignal(p.row) ? 'detalle' : 'grupo';
    return { index: p.index, row: p.row, kind };
  });

  return { rows: out, dominantDensity };
}

/**
 * De una fila dispersa (encabezado de grupo) extrae código y nombre de cliente.
 * Elige por la forma del valor, no por la posición: lo que parece identificador
 * es el código y lo que parece nombre propio es el nombre.
 */
export function readGroupHeader(r: Row): { codigo: string; nombre: string } | null {
  const cells = r.filter((c) => !isBlank(c)).map(text);
  if (cells.length === 0) return null;
  const idLike = (s: string) => /^[a-z]?-?\d[\d.\-/]*$/i.test(s) || /^\d+$/.test(s);
  const nameLike = (s: string) => /[a-záéíóúñ]{3,}/i.test(s) && s.length >= 4;

  let codigo = '';
  let nombre = '';
  for (const c of cells) {
    if (!codigo && idLike(c)) codigo = c;
    else if (!nombre && nameLike(c)) nombre = c;
  }
  if (!nombre) {
    const alt = cells.find((c) => c !== codigo && nameLike(c));
    if (alt) nombre = alt;
  }
  if (!nombre && !codigo) return null;
  if (!nombre) return null;
  return { codigo, nombre };
}

/** Extrae los números de una fila de totales, para reconciliar contra lo calculado. */
export function readTotalNumbers(r: Row): number[] {
  return r.map(toNumber).filter((n): n is number => n !== null);
}
