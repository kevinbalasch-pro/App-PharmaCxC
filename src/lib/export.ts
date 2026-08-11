import * as XLSX from 'xlsx';
import type { BucketRow, ClienteRow, EnrichedDoc, Kpis, MesRow, VendedorRow } from './metrics';
import type { Diagnostics } from './types';

const MONEDA = '#,##0.00';
const ENTERO = '#,##0';
const PORCENT = '0.0"%"';
const FECHA = 'dd/mm/yyyy';

interface Col<T> {
  header: string;
  value: (r: T) => string | number | Date | null;
  width: number;
  fmt?: string;
}

/** Construye una hoja a partir de columnas tipadas, aplicando formato numérico real. */
function hoja<T>(rows: T[], cols: Col<T>[]): XLSX.WorkSheet {
  const aoa: unknown[][] = [cols.map((c) => c.header), ...rows.map((r) => cols.map((c) => c.value(r)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  ws['!cols'] = cols.map((c) => ({ wch: c.width }));
  if (rows.length > 0) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: cols.length - 1 } }) };
  }
  // Los formatos se aplican celda por celda: Excel debe recibir números, no texto.
  cols.forEach((c, ci) => {
    if (!c.fmt) return;
    for (let ri = 1; ri <= rows.length; ri++) {
      const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
      if (cell && (cell.t === 'n' || cell.t === 'd')) cell.z = c.fmt;
    }
  });
  return ws;
}

export interface ExportInput {
  kpis: Kpis;
  aging: BucketRow[];
  clientes: ClienteRow[];
  vendedores: VendedorRow[];
  meses: MesRow[];
  docs: EnrichedDoc[];
  diag: Diagnostics;
  asOf: Date;
  /** Descripción legible de los filtros activos, o null si no hay ninguno. */
  filtros: string | null;
}

export function construirLibro(i: ExportInput): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // --- Resumen: KPIs y contexto de la extracción ---
  const resumen: unknown[][] = [
    ['Resumen de Cuentas por Cobrar'],
    [],
    ['Archivo de origen', i.diag.fileName],
    ['Hoja leída', i.diag.sheetName],
    ['Fecha de corte', i.asOf],
    ['Generado', new Date()],
    ['Filtros aplicados', i.filtros ?? 'Ninguno (cartera completa)'],
    [],
    ['Indicador', 'Valor', 'Detalle'],
    ['Cartera total', i.kpis.carteraTotal, `${i.kpis.documentos} documentos de ${i.kpis.clientes} clientes`],
    ['Vencido +90 días', i.kpis.saldoCritico, 'riesgo alto'],
    ['Antigüedad promedio (días)', Math.round(i.kpis.antiguedadPromedio), 'ponderada por monto'],
    ['Monto original facturado', i.kpis.montoOriginal, 'suma del neto de los documentos abiertos'],
    ['Ya abonado', i.kpis.abonado, `${i.kpis.pctRecuperado.toFixed(1)}% de recuperación`],
    ['Concentración top 10 clientes', i.kpis.concentracionTop10 / 100, 'participación en la cartera'],
    ['Ticket promedio', i.kpis.ticketPromedio, 'saldo medio por documento'],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen, { cellDates: true });
  wsResumen['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 46 }];
  for (const [ref, z] of [
    ['B5', FECHA],
    ['B6', 'dd/mm/yyyy hh:mm'],
    ['B10', MONEDA],
    ['B11', MONEDA],
    ['B12', ENTERO],
    ['B13', MONEDA],
    ['B14', MONEDA],
    ['B15', '0.0%'],
    ['B16', MONEDA],
  ] as const) {
    if (wsResumen[ref]) wsResumen[ref].z = z;
  }
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  XLSX.utils.book_append_sheet(
    wb,
    hoja(i.aging, [
      { header: 'Antigüedad', value: (r) => r.bucket, width: 14 },
      { header: 'Saldo', value: (r) => r.saldo, width: 16, fmt: MONEDA },
      { header: 'Documentos', value: (r) => r.docs, width: 12, fmt: ENTERO },
      { header: '% de la cartera', value: (r) => r.pct, width: 16, fmt: PORCENT },
    ]),
    'Antigüedad',
  );

  XLSX.utils.book_append_sheet(
    wb,
    hoja(i.clientes, [
      { header: 'Cliente', value: (r) => r.cliente, width: 38 },
      { header: 'Código', value: (r) => r.codigo, width: 14 },
      { header: 'Saldo', value: (r) => r.saldo, width: 16, fmt: MONEDA },
      { header: 'Vencido', value: (r) => r.vencido, width: 16, fmt: MONEDA },
      { header: 'Documentos', value: (r) => r.docs, width: 12, fmt: ENTERO },
      { header: 'Atraso máximo (días)', value: (r) => r.maxDias, width: 20, fmt: ENTERO },
      { header: '% de la cartera', value: (r) => r.pct, width: 16, fmt: PORCENT },
    ]),
    'Por cliente',
  );

  XLSX.utils.book_append_sheet(
    wb,
    hoja(i.vendedores, [
      { header: 'Vendedor', value: (r) => r.vendedor, width: 18 },
      { header: 'Código(s)', value: (r) => r.codigos.join(', '), width: 14 },
      { header: 'Saldo', value: (r) => r.saldo, width: 16, fmt: MONEDA },
      { header: 'Vencido', value: (r) => r.vencido, width: 16, fmt: MONEDA },
      { header: '% vencido', value: (r) => r.pctVencido, width: 12, fmt: PORCENT },
      { header: 'Documentos', value: (r) => r.docs, width: 12, fmt: ENTERO },
    ]),
    'Por vendedor',
  );

  XLSX.utils.book_append_sheet(
    wb,
    hoja(i.meses, [
      { header: 'Mes de emisión', value: (r) => r.etiqueta, width: 16 },
      { header: 'Monto original', value: (r) => r.neto, width: 16, fmt: MONEDA },
      { header: 'Saldo pendiente', value: (r) => r.saldo, width: 16, fmt: MONEDA },
      { header: 'Ya abonado', value: (r) => r.neto - r.saldo, width: 16, fmt: MONEDA },
      { header: 'Documentos', value: (r) => r.docs, width: 12, fmt: ENTERO },
    ]),
    'Por mes',
  );

  XLSX.utils.book_append_sheet(
    wb,
    hoja(i.docs, [
      { header: 'Cliente', value: (r) => r.clienteNombre, width: 38 },
      { header: 'Código cliente', value: (r) => r.clienteCodigo, width: 14 },
      { header: 'Tipo', value: (r) => r.tipoDoc, width: 8 },
      { header: 'Documento', value: (r) => r.numero, width: 14 },
      { header: 'Emisión', value: (r) => r.emision, width: 12, fmt: FECHA },
      { header: 'Productos', value: (r) => r.productos.join(' · '), width: 42 },
      { header: 'Días de atraso', value: (r) => r.dias, width: 14, fmt: ENTERO },
      { header: 'Antigüedad', value: (r) => r.bucket, width: 12 },
      { header: 'Vendedor', value: (r) => r.vendedorNombre, width: 16 },
      { header: 'Código vendedor', value: (r) => r.vendedor, width: 14 },
      { header: 'Monto original', value: (r) => r.neto, width: 16, fmt: MONEDA },
      { header: 'Abonado', value: (r) => r.abonado, width: 14, fmt: MONEDA },
      { header: 'Saldo', value: (r) => r.saldo, width: 16, fmt: MONEDA },
      { header: 'Moneda', value: (r) => r.moneda, width: 9 },
    ]),
    'Detalle',
  );

  return wb;
}

export function nombreArchivo(diag: Diagnostics, asOf: Date): string {
  const base = diag.fileName.replace(/\.[^.]+$/, '');
  return `Dashboard CxC - ${base} - ${asOf.toISOString().slice(0, 10)}.xlsx`;
}

export function descargarExcel(input: ExportInput): void {
  XLSX.writeFile(construirLibro(input), nombreArchivo(input.diag, input.asOf), { compression: true });
}
