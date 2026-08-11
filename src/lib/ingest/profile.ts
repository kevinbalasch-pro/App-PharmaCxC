import {
  CURRENCY_VOCAB,
  DOC_VOCAB,
  isBlank,
  isNum,
  norm,
  text,
  toDate,
  toNumber,
  type Row,
} from './cells';
import type { Role } from '../types';

export interface ColumnProfile {
  index: number;
  n: number;
  filled: number;
  fillRatio: number;
  dateRatio: number;
  numRatio: number;
  strRatio: number;
  cardinality: number;
  uniqueRatio: number;
  avgLen: number;
  digitsRatio: number;
  idRatio: number;
  nameRatio: number;
  docVocabRatio: number;
  currVocabRatio: number;
  decimalRatio: number;
  leadingZeroRatio: number;
  meanDate: number | null;
  sum: number;
  absMean: number;
  values: unknown[];
}

const ID_RE = /^[vjegp]-?\d{5,}$/i;
const NAME_RE = /^[a-záéíóúüñ.,'’ -]{4,}$/i;

export function profileColumn(rows: Row[], index: number): ColumnProfile {
  const values = rows.map((r) => r[index]);
  const filledVals = values.filter((c) => !isBlank(c));
  const n = values.length;
  const filled = filledVals.length;
  const safe = filled || 1;

  let dates = 0;
  let nums = 0;
  let strs = 0;
  let digits = 0;
  let ids = 0;
  let names = 0;
  let docv = 0;
  let currv = 0;
  let decimals = 0;
  let leadingZeros = 0;
  let dateSum = 0;
  let sum = 0;
  let absSum = 0;
  let lenSum = 0;
  const uniq = new Set<string>();

  for (const c of filledVals) {
    const t = text(c);
    lenSum += t.length;
    uniq.add(t);

    const d = toDate(c);
    if (d) {
      dates++;
      dateSum += d.getTime();
    }
    if (isNum(c)) {
      nums++;
      sum += c;
      absSum += Math.abs(c);
      if (!Number.isInteger(c)) decimals++;
    } else {
      const parsed = toNumber(c);
      if (parsed !== null && /^[\d.,()\s-]+$/.test(t)) {
        nums++;
        sum += parsed;
        absSum += Math.abs(parsed);
        if (!Number.isInteger(parsed)) decimals++;
      }
    }
    if (typeof c === 'string') {
      strs++;
      if (/^0\d/.test(t)) leadingZeros++;
      if (/^\d+$/.test(t)) digits++;
      if (ID_RE.test(t) || /^\d{6,}$/.test(t)) ids++;
      if (NAME_RE.test(t) && /[a-záéíóúñ]/i.test(t)) names++;
      if (DOC_VOCAB.has(norm(t))) docv++;
      if (CURRENCY_VOCAB.has(norm(t))) currv++;
    }
  }

  return {
    index,
    n,
    filled,
    fillRatio: filled / (n || 1),
    dateRatio: dates / safe,
    numRatio: nums / safe,
    strRatio: strs / safe,
    cardinality: uniq.size,
    uniqueRatio: uniq.size / safe,
    avgLen: lenSum / safe,
    digitsRatio: digits / safe,
    idRatio: ids / safe,
    nameRatio: names / safe,
    docVocabRatio: docv / safe,
    currVocabRatio: currv / safe,
    decimalRatio: decimals / (nums || 1),
    leadingZeroRatio: leadingZeros / safe,
    meanDate: dates > 0 ? dateSum / dates : null,
    sum,
    absMean: nums > 0 ? absSum / nums : 0,
    values: filledVals,
  };
}

const HEADER_PATTERNS: Record<Role, RegExp> = {
  clienteCodigo: /\b(cod|codigo|rif|cedula|ci|nit|id)\b.*\b(cli|cliente)?\b|^cliente cod/,
  clienteNombre: /\b(cliente|razon social|nombre|beneficiario|deudor)\b/,
  tipoDoc: /\btipo\b|\bdocumento\b|\bclase\b/,
  numero: /\b(numero|nro|no|num|documento|factura|comprobante|referencia)\b/,
  emision: /\b(emision|emitido|fecha doc|fecha factura|fecha)\b/,
  vencimiento: /\b(vencim|vence|vcto|vencimiento|expira)\b/,
  vendedor: /\b(vend|vendedor|asesor|ejecutivo|agente|cobrador)\b/,
  neto: /\b(neto|monto|importe|original|bruto|total doc)\b/,
  saldo: /\b(saldo|pendiente|por cobrar|deuda|balance)\b/,
  moneda: /\b(moneda|divisa|currency)\b/,
  tasa: /\b(tasa|cambio|rate|paridad)\b/,
  observacion: /\b(observ|descrip|concepto|detalle|nota|glosa)\b/,
};

/** Qué tan bien el texto del encabezado sugiere un rol. */
function headerScore(header: string, role: Role): number {
  const n = norm(header);
  if (!n) return 0;
  return HEADER_PATTERNS[role].test(n) ? 1 : 0;
}

/** Qué tan bien la forma de los valores sugiere un rol. Esta es la señal dominante. */
function profileScore(p: ColumnProfile, role: Role): number {
  if (p.filled === 0) return 0;
  const s = (x: boolean, v: number) => (x ? v : 0);

  switch (role) {
    case 'emision':
    case 'vencimiento':
      return p.dateRatio > 0.7 ? 0.95 : 0;

    case 'saldo':
    case 'neto':
      // Numérica, con dispersión real y sin pinta de identificador ni de tasa.
      if (p.numRatio < 0.8) return 0;
      if (p.dateRatio > 0.5) return 0;
      if (p.cardinality <= 3 && p.decimalRatio > 0.8) return 0; // eso es una tasa
      // Un folio ("0000004188") es dígitos, pero nunca un monto: los montos no
      // llevan ceros a la izquierda ni son únicos fila a fila.
      if (p.leadingZeroRatio > 0.2) return 0;
      if (p.strRatio > 0.7 && p.uniqueRatio > 0.9) return 0;
      return 0.6 + s(p.cardinality > 5, 0.2) + s(p.absMean > 1, 0.1);

    case 'tasa':
      if (p.numRatio < 0.8) return 0;
      return p.cardinality <= 6 && p.decimalRatio > 0.5 ? 0.9 : 0;

    case 'moneda':
      return p.currVocabRatio > 0.7 ? 0.95 : 0;

    case 'tipoDoc':
      if (p.docVocabRatio > 0.35) return 0.9;
      return p.strRatio > 0.8 && p.cardinality <= 10 && p.avgLen <= 6 ? 0.5 : 0;

    case 'numero':
      if (p.strRatio < 0.6 && p.digitsRatio < 0.6) return 0;
      if (p.dateRatio > 0.3) return 0;
      if (!(p.uniqueRatio > 0.6 && p.avgLen >= 4 && (p.digitsRatio > 0.6 || p.idRatio > 0.3))) return 0;
      return p.leadingZeroRatio > 0.5 ? 0.95 : 0.85;

    case 'vendedor':
      if (p.strRatio < 0.7) return 0;
      return p.cardinality <= 30 && p.avgLen <= 8 && p.uniqueRatio < 0.35 && p.docVocabRatio < 0.2
        ? 0.8
        : 0;

    case 'clienteNombre':
      return p.nameRatio > 0.7 && p.avgLen >= 6 && p.cardinality > 3 ? 0.9 : 0;

    case 'clienteCodigo':
      if (p.dateRatio > 0.3) return 0;
      return (p.idRatio > 0.4 || (p.digitsRatio > 0.5 && p.avgLen >= 2)) && p.uniqueRatio < 0.95
        ? 0.7
        : 0;

    case 'observacion':
      return p.strRatio > 0.8 && p.avgLen > 20 ? 0.8 : 0;

    default:
      return 0;
  }
}

const ALL_ROLES: Role[] = [
  'emision',
  'vencimiento',
  'saldo',
  'neto',
  'clienteNombre',
  'tipoDoc',
  'numero',
  'vendedor',
  'clienteCodigo',
  'moneda',
  'tasa',
  'observacion',
];

export interface Assignment {
  role: Role;
  index: number;
  score: number;
  evidence: string;
}

function evidenceFor(p: ColumnProfile, role: Role): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  switch (role) {
    case 'emision':
    case 'vencimiento':
      return `${pct(p.dateRatio)} fechas válidas`;
    case 'saldo':
    case 'neto':
      return `${pct(p.numRatio)} numérica, ${p.cardinality} valores distintos`;
    case 'tasa':
      return `numérica con solo ${p.cardinality} valores y decimales`;
    case 'moneda':
      return `${pct(p.currVocabRatio)} códigos de moneda conocidos`;
    case 'tipoDoc':
      return p.docVocabRatio > 0.35
        ? `${pct(p.docVocabRatio)} coincide con tipos de documento conocidos`
        : `texto corto con ${p.cardinality} categorías`;
    case 'numero':
      return `${pct(p.uniqueRatio)} valores únicos, formato de folio`;
    case 'vendedor':
      return `código corto repetido, ${p.cardinality} distintos`;
    case 'clienteNombre':
      return `${pct(p.nameRatio)} con forma de nombre propio`;
    case 'clienteCodigo':
      return `identificadores (cédula/RIF/código), ${p.cardinality} distintos`;
    case 'observacion':
      return `texto largo (${Math.round(p.avgLen)} caracteres promedio)`;
    default:
      return '';
  }
}

/**
 * Asigna roles a columnas combinando forma de los valores (65%) y texto del
 * encabezado (35%). Los valores pesan más a propósito: en reportes exportados
 * los encabezados suelen estar corridos o ausentes.
 */
export function assignRoles(
  profiles: ColumnProfile[],
  headers: string[],
): { assignments: Assignment[]; headerOffset: number } {
  const pairs: Assignment[] = [];
  for (const p of profiles) {
    for (const role of ALL_ROLES) {
      const ps = profileScore(p, role);
      if (ps === 0) continue;
      const hs = headerScore(headers[p.index] ?? '', role);
      pairs.push({
        role,
        index: p.index,
        score: 0.65 * ps + 0.35 * hs,
        evidence: evidenceFor(p, role),
      });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const takenRole = new Set<Role>();
  const takenCol = new Set<number>();
  const assignments: Assignment[] = [];
  for (const p of pairs) {
    if (takenRole.has(p.role) || takenCol.has(p.index)) continue;
    if (p.score < 0.35) continue;
    assignments.push(p);
    takenRole.add(p.role);
    takenCol.add(p.index);
  }

  fixDatePair(assignments, profiles);
  fixMoneyPair(assignments, profiles);

  // ¿Los encabezados describen otra columna? Se prueba un corrimiento constante.
  let headerOffset = 0;
  let bestHit = -1;
  for (const shift of [0, -1, 1, -2, 2]) {
    let hit = 0;
    for (const a of assignments) {
      hit += headerScore(headers[a.index + shift] ?? '', a.role);
    }
    if (hit > bestHit) {
      bestHit = hit;
      headerOffset = shift;
    }
  }

  return { assignments, headerOffset };
}

/** Entre dos columnas de fecha, la de media más temprana es la emisión. */
function fixDatePair(assignments: Assignment[], profiles: ColumnProfile[]): void {
  const emi = assignments.find((a) => a.role === 'emision');
  const ven = assignments.find((a) => a.role === 'vencimiento');
  if (!emi || !ven) return;
  const pe = profiles[emi.index];
  const pv = profiles[ven.index];
  if (pe.meanDate === null || pv.meanDate === null) return;
  if (pe.meanDate > pv.meanDate) {
    emi.role = 'vencimiento';
    ven.role = 'emision';
  }
}

/** El neto nunca es menor que el saldo: si la suma dice lo contrario, se intercambian. */
function fixMoneyPair(assignments: Assignment[], profiles: ColumnProfile[]): void {
  const neto = assignments.find((a) => a.role === 'neto');
  const saldo = assignments.find((a) => a.role === 'saldo');
  if (!neto || !saldo) return;
  if (profiles[neto.index].sum < profiles[saldo.index].sum) {
    neto.role = 'saldo';
    saldo.role = 'neto';
  }
}
