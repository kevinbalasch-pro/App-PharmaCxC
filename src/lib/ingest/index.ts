import * as XLSX from 'xlsx';
import type { ARDoc, ColumnMapping, Dataset, Diagnostics, ReconCheck, Role, SheetScore } from '../types';
import { ROLE_LABEL } from '../types';
import { colLetter, isBlank, isGrandTotalText, text, toDate, toNumber, type Row } from './cells';
import { classifyRows, readGroupHeader, readTotalNumbers, type ClassifiedRow } from './rows';
import { assignRoles, profileColumn, type ColumnProfile } from './profile';
import { detectarCatalogoEnFilas } from '../vendedores';

export interface IngestOptions {
  /** Fuerza una hoja concreta; por defecto se elige la de mayor puntaje. */
  sheetName?: string;
}

function sheetToRows(ws: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

/** Puntúa cada hoja para elegir la que contiene el detalle de documentos. */
function scoreSheets(wb: XLSX.WorkBook): SheetScore[] {
  return wb.SheetNames.map((name) => {
    const rows = sheetToRows(wb.Sheets[name]);
    const { rows: cls } = classifyRows(rows);
    const detalle = cls.filter((r) => r.kind === 'detalle').length;
    const cols = Math.max(0, ...rows.map((r) => r.length));
    const score = detalle * 10 + cols;
    return {
      name,
      score,
      reason: `${detalle} filas de detalle · ${cols} columnas`,
    };
  }).sort((a, b) => b.score - a.score);
}

function buildHeaders(cls: ClassifiedRow[], width: number): string[] {
  const headerRow = cls.find((r) => r.kind === 'encabezado')?.row;
  const headers: string[] = new Array(width).fill('');
  if (headerRow) {
    for (let i = 0; i < width; i++) headers[i] = text(headerRow[i]);
  }
  return headers;
}

export function ingestWorkbook(wb: XLSX.WorkBook, fileName: string, opts: IngestOptions = {}): Dataset {
  const sheetScores = scoreSheets(wb);
  const sheetName = opts.sheetName ?? sheetScores[0]?.name ?? wb.SheetNames[0];
  const rows = sheetToRows(wb.Sheets[sheetName]);
  const width = Math.max(0, ...rows.map((r) => r.length));

  const { rows: cls } = classifyRows(rows);
  const detalle = cls.filter((r) => r.kind === 'detalle');
  const headers = buildHeaders(cls, width);

  const profiles: ColumnProfile[] = [];
  for (let i = 0; i < width; i++) profiles.push(profileColumn(detalle.map((d) => d.row), i));

  const { assignments, headerOffset } = assignRoles(profiles, headers);
  const roleCol = new Map<Role, number>();
  for (const a of assignments) roleCol.set(a.role, a.index);

  const layout: 'plana' | 'agrupada' =
    cls.some((r) => r.kind === 'grupo') || cls.some((r) => r.kind === 'total') ? 'agrupada' : 'plana';

  const warnings: string[] = [];
  const descartadas: Diagnostics['descartadas'] = [];

  const unmappedRoles = (Object.keys(ROLE_LABEL) as Role[]).filter((r) => !roleCol.has(r));
  if (!roleCol.has('saldo')) warnings.push(`No se pudo identificar la columna "${ROLE_LABEL.saldo}".`);
  if (headerOffset !== 0) {
    warnings.push(
      `Los encabezados están corridos ${Math.abs(headerOffset)} columna(s) respecto a los datos. ` +
        `Se ignoraron los títulos y se usó la forma de los valores para mapear.`,
    );
  }

  // Recorrido en orden: las filas dispersas fijan el cliente vigente para las de detalle.
  const docs: ARDoc[] = [];
  let ctx: { codigo: string; nombre: string } | null = null;
  const grandTotals: number[] = [];

  const cell = (row: Row, role: Role): unknown => {
    const i = roleCol.get(role);
    return i === undefined ? null : row[i];
  };

  for (const c of cls) {
    if (c.kind === 'grupo') {
      const g = readGroupHeader(c.row);
      if (g) ctx = g;
      else descartadas.push({ fila: c.index + 1, motivo: 'Fila dispersa no interpretable', contenido: preview(c.row) });
      continue;
    }
    if (c.kind === 'total') {
      const label = c.row.find((x) => typeof x === 'string' && String(x).trim() !== '');
      if (typeof label === 'string' && isGrandTotalText(label)) grandTotals.push(...readTotalNumbers(c.row));
      descartadas.push({ fila: c.index + 1, motivo: 'Fila de totales del reporte', contenido: preview(c.row) });
      continue;
    }
    if (c.kind === 'ruido') {
      descartadas.push({ fila: c.index + 1, motivo: 'Nota al pie', contenido: preview(c.row) });
      continue;
    }
    if (c.kind !== 'detalle') continue;

    const nombre = text(cell(c.row, 'clienteNombre')) || ctx?.nombre || '(sin cliente)';
    const codigo = text(cell(c.row, 'clienteCodigo')) || ctx?.codigo || '';
    const saldo = toNumber(cell(c.row, 'saldo')) ?? 0;
    const netoRaw = toNumber(cell(c.row, 'neto'));

    docs.push({
      clienteCodigo: codigo,
      clienteNombre: nombre,
      tipoDoc: text(cell(c.row, 'tipoDoc')) || 'N/D',
      numero: text(cell(c.row, 'numero')),
      emision: toDate(cell(c.row, 'emision')),
      vencimiento: toDate(cell(c.row, 'vencimiento')) ?? toDate(cell(c.row, 'emision')),
      vendedor: text(cell(c.row, 'vendedor')) || 'N/D',
      neto: netoRaw ?? saldo,
      saldo,
      moneda: text(cell(c.row, 'moneda')) || 'USD',
      tasa: toNumber(cell(c.row, 'tasa')),
    });
  }

  const sinCliente = docs.filter((d) => d.clienteNombre === '(sin cliente)').length;
  if (sinCliente > 0) {
    warnings.push(
      `${sinCliente} documento(s) quedaron sin cliente: no hay columna de nombre ni encabezado de grupo que los cubra.`,
    );
  }

  const sumSaldo = round2(docs.reduce((a, d) => a + d.saldo, 0));
  const sumNeto = round2(docs.reduce((a, d) => a + d.neto, 0));

  const reconciliation: ReconCheck[] = [];
  if (grandTotals.length) {
    reconciliation.push(matchTotal('Saldo pendiente', sumSaldo, grandTotals));
    if (roleCol.has('neto')) reconciliation.push(matchTotal('Monto original (neto)', sumNeto, grandTotals));
  } else {
    warnings.push('El archivo no trae una fila de "Totales", así que no se pudo verificar la suma contra el reporte.');
  }
  for (const r of reconciliation) {
    if (!r.ok) {
      warnings.push(
        `La suma de ${r.label} (${fmt(r.calculado)}) no coincide con el total del reporte (${fmt(r.reportado)}).`,
      );
    }
  }

  const mapping: ColumnMapping[] = assignments
    .map((a) => ({
      index: a.index,
      columnLetter: colLetter(a.index),
      role: a.role,
      score: a.score,
      headerText: headers[a.index] ?? '',
      evidence: a.evidence,
    }))
    .sort((a, b) => a.index - b.index);

  // Las hojas auxiliares del libro pueden traer la tabla de vendedores.
  let catalogoVendedores: Record<string, string> | null = null;
  let catalogoHoja: string | null = null;
  for (const otra of wb.SheetNames) {
    if (otra === sheetName) continue;
    const encontrado = detectarCatalogoEnFilas(sheetToRows(wb.Sheets[otra]));
    if (encontrado && Object.keys(encontrado).length > (catalogoVendedores ? Object.keys(catalogoVendedores).length : 0)) {
      catalogoVendedores = encontrado;
      catalogoHoja = otra;
    }
  }

  const diag: Diagnostics = {
    fileName,
    sheetName,
    sheetScores,
    layout,
    rowCounts: {
      total: rows.length,
      detalle: detalle.length,
      grupo: cls.filter((r) => r.kind === 'grupo').length,
      totales: cls.filter((r) => r.kind === 'total').length,
      encabezado: cls.filter((r) => r.kind === 'encabezado').length,
      ruido: cls.filter((r) => r.kind === 'ruido').length,
      vacia: cls.filter((r) => r.kind === 'vacia').length,
    },
    mapping,
    unmappedRoles,
    headerOffset,
    warnings,
    reconciliation,
    descartadas,
    catalogoVendedores:
      catalogoVendedores && catalogoHoja
        ? { hoja: catalogoHoja, entradas: Object.keys(catalogoVendedores).length }
        : null,
  };

  return { docs, diag, catalogoVendedores };
}

export function ingestArrayBuffer(buf: ArrayBuffer, fileName: string, opts?: IngestOptions): Dataset {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  return ingestWorkbook(wb, fileName, opts);
}

export function listSheets(buf: ArrayBuffer): string[] {
  return XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames;
}

function matchTotal(label: string, calculado: number, candidates: number[]): ReconCheck {
  let bestVal = candidates[0] ?? 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = Math.abs(round2(c) - calculado);
    if (d < bestDelta) {
      bestDelta = d;
      bestVal = c;
    }
  }
  return {
    label,
    reportado: round2(bestVal),
    calculado,
    delta: round2(bestDelta),
    ok: bestDelta <= 0.01,
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const fmt = (n: number): string => n.toLocaleString('es-VE', { maximumFractionDigits: 2 });

function preview(r: Row): string {
  return r
    .filter((c) => !isBlank(c))
    .map(text)
    .join(' | ')
    .slice(0, 90);
}
