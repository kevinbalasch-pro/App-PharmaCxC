import type { ARDoc } from './types';
import { nombreVendedor, type Catalogo } from './vendedores';
import { normalizarDoc, type LineaProducto } from './ingest/productos';

export const BUCKETS = ['0–30', '31–60', '61–90', '> 90'] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Rampa secuencial de un solo tono (azul, claro→oscuro): más oscuro = más atraso. */
export const BUCKET_COLOR: Record<Bucket, string> = {
  '0–30': '#86b6ef',
  '31–60': '#3987e5',
  '61–90': '#1c5cab',
  '> 90': '#0d366b',
};

const DAY = 86400000;

export function diasVencido(d: ARDoc, asOf: Date): number | null {
  const ref = d.vencimiento ?? d.emision;
  if (!ref) return null;
  return Math.floor((asOf.getTime() - ref.getTime()) / DAY);
}

/**
 * Los documentos aún no vencidos entran en el primer tramo: en esta operación
 * todo se emite a contado, así que separarlos no aportaba información.
 */
export function bucketOf(dias: number | null): Bucket {
  if (dias === null || dias <= 30) return '0–30';
  if (dias <= 60) return '31–60';
  if (dias <= 90) return '61–90';
  return '> 90';
}

export interface EnrichedDoc extends ARDoc {
  dias: number | null;
  bucket: Bucket;
  abonado: number;
  /** Nombre resuelto desde el catálogo; `vendedor` conserva el código del ERP. */
  vendedorNombre: string;
  /** Productos del documento, con cantidad, para mostrar. Vacío sin archivo de productos. */
  productos: string[];
  /** Los mismos productos sin la cantidad: es la clave por la que se filtra. */
  productosBase: string[];
}

export function enrich(
  docs: ARDoc[],
  asOf: Date,
  catalogo?: Catalogo | null,
  productos?: Map<string, LineaProducto[]> | null,
): EnrichedDoc[] {
  return docs.map((d) => {
    const dias = diasVencido(d, asOf);
    const lineas = productos?.get(normalizarDoc(d.numero)) ?? [];
    return {
      ...d,
      dias,
      bucket: bucketOf(dias),
      abonado: d.neto - d.saldo,
      vendedorNombre: nombreVendedor(d.vendedor, catalogo),
      productos: lineas.map((l) =>
        l.cantidad !== null && l.cantidad !== 1 ? `${l.cantidad}× ${l.descripcion}` : l.descripcion,
      ),
      productosBase: [...new Set(lineas.map((l) => l.descripcion))],
    };
  });
}

/**
 * Fecha de corte: la última emisión del archivo.
 *
 * Se usa la emisión y no el vencimiento a propósito: un documento emitido hoy con
 * vencimiento mañana no significa que el reporte sea de mañana, y contarlo así
 * envejecería toda la cartera un día de más.
 */
export function inferAsOf(docs: ARDoc[]): Date {
  let max = 0;
  for (const d of docs) {
    if (d.emision && d.emision.getTime() > max) max = d.emision.getTime();
  }
  if (max) return new Date(max);
  for (const d of docs) {
    if (d.vencimiento && d.vencimiento.getTime() > max) max = d.vencimiento.getTime();
  }
  return max ? new Date(max) : new Date();
}

export interface Kpis {
  carteraTotal: number;
  montoOriginal: number;
  abonado: number;
  pctRecuperado: number;
  saldoCritico: number;
  clientes: number;
  documentos: number;
  antiguedadPromedio: number;
  concentracionTop10: number;
  ticketPromedio: number;
}

export function computeKpis(docs: EnrichedDoc[]): Kpis {
  const carteraTotal = sum(docs.map((d) => d.saldo));
  const montoOriginal = sum(docs.map((d) => d.neto));
  const abonado = montoOriginal - carteraTotal;
  const saldoCritico = sum(docs.filter((d) => d.bucket === '> 90').map((d) => d.saldo));

  // Antigüedad promedio ponderada por saldo: los montos grandes pesan más.
  const pesoPos = docs.filter((d) => d.saldo > 0 && d.dias !== null);
  const pesoTotal = sum(pesoPos.map((d) => d.saldo));
  const antiguedadPromedio = pesoTotal > 0 ? sum(pesoPos.map((d) => d.saldo * (d.dias as number))) / pesoTotal : 0;

  const porCliente = groupSum(docs, (d) => d.clienteNombre);
  const top10 = [...porCliente.values()].sort((a, b) => b - a).slice(0, 10);

  return {
    carteraTotal,
    montoOriginal,
    abonado,
    pctRecuperado: montoOriginal > 0 ? (abonado / montoOriginal) * 100 : 0,
    saldoCritico,
    clientes: porCliente.size,
    documentos: docs.length,
    antiguedadPromedio,
    concentracionTop10: carteraTotal > 0 ? (sum(top10) / carteraTotal) * 100 : 0,
    ticketPromedio: docs.length ? carteraTotal / docs.length : 0,
  };
}

export interface BucketRow {
  bucket: Bucket;
  saldo: number;
  docs: number;
  pct: number;
}

export function agingSeries(docs: EnrichedDoc[]): BucketRow[] {
  const total = sum(docs.map((d) => d.saldo));
  return BUCKETS.map((bucket) => {
    const sel = docs.filter((d) => d.bucket === bucket);
    const saldo = sum(sel.map((d) => d.saldo));
    return { bucket, saldo, docs: sel.length, pct: total > 0 ? (saldo / total) * 100 : 0 };
  });
}

export interface ClienteRow {
  cliente: string;
  codigo: string;
  saldo: number;
  neto: number;
  abonado: number;
  docs: number;
  vencido: number;
  maxDias: number;
  /** Tramo del documento más atrasado del cliente. */
  peorBucket: Bucket;
  vendedores: string[];
  pct: number;
}

export function porCliente(docs: EnrichedDoc[]): ClienteRow[] {
  const map = new Map<string, ClienteRow & { setVend: Set<string> }>();
  const total = sum(docs.map((d) => d.saldo));
  for (const d of docs) {
    const r =
      map.get(d.clienteNombre) ??
      {
        cliente: d.clienteNombre,
        codigo: d.clienteCodigo,
        saldo: 0,
        neto: 0,
        abonado: 0,
        docs: 0,
        vencido: 0,
        maxDias: 0,
        peorBucket: '0–30' as Bucket,
        vendedores: [],
        setVend: new Set<string>(),
        pct: 0,
      };
    r.saldo += d.saldo;
    r.neto += d.neto;
    r.abonado += d.abonado;
    r.docs += 1;
    if ((d.dias ?? 0) > 0) r.vencido += d.saldo;
    r.maxDias = Math.max(r.maxDias, d.dias ?? 0);
    r.setVend.add(d.vendedorNombre);
    map.set(d.clienteNombre, r);
  }
  return [...map.values()]
    .map(({ setVend, ...r }) => ({
      ...r,
      vendedores: [...setVend].sort(),
      peorBucket: bucketOf(r.maxDias),
      pct: total > 0 ? (r.saldo / total) * 100 : 0,
    }))
    .sort((a, b) => b.saldo - a.saldo);
}

export interface VendedorRow {
  vendedor: string;
  /** Códigos del ERP que resolvieron a este nombre (Ada tiene dos: 7 y 8). */
  codigos: string[];
  saldo: number;
  docs: number;
  vencido: number;
  pctVencido: number;
}

/** Agrupa por nombre: si dos códigos son la misma persona, sus carteras se suman. */
export function porVendedor(docs: EnrichedDoc[]): VendedorRow[] {
  const map = new Map<string, VendedorRow & { setCodigos: Set<string> }>();
  for (const d of docs) {
    const k = d.vendedorNombre;
    const r =
      map.get(k) ??
      { vendedor: k, codigos: [], setCodigos: new Set<string>(), saldo: 0, docs: 0, vencido: 0, pctVencido: 0 };
    r.saldo += d.saldo;
    r.docs += 1;
    if ((d.dias ?? 0) > 0) r.vencido += d.saldo;
    r.setCodigos.add(d.vendedor);
    map.set(k, r);
  }
  return [...map.values()]
    .map(({ setCodigos, ...r }) => ({
      ...r,
      codigos: [...setCodigos].sort(),
      pctVencido: r.saldo > 0 ? (r.vencido / r.saldo) * 100 : 0,
    }))
    .sort((a, b) => b.saldo - a.saldo);
}

export interface MesRow {
  mes: string;
  etiqueta: string;
  neto: number;
  saldo: number;
  docs: number;
}

export function porMesEmision(docs: EnrichedDoc[]): MesRow[] {
  const map = new Map<string, MesRow>();
  for (const d of docs) {
    if (!d.emision) continue;
    const y = d.emision.getUTCFullYear();
    const m = d.emision.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const r = map.get(key) ?? { mes: key, etiqueta: `${MESES[m]} ${String(y).slice(2)}`, neto: 0, saldo: 0, docs: 0 };
    r.neto += d.neto;
    r.saldo += d.saldo;
    r.docs += 1;
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function porTipoDoc(docs: EnrichedDoc[]): { tipo: string; saldo: number; docs: number }[] {
  const map = new Map<string, { tipo: string; saldo: number; docs: number }>();
  for (const d of docs) {
    const r = map.get(d.tipoDoc) ?? { tipo: d.tipoDoc, saldo: 0, docs: 0 };
    r.saldo += d.saldo;
    r.docs += 1;
    map.set(d.tipoDoc, r);
  }
  return [...map.values()].sort((a, b) => b.saldo - a.saldo);
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function groupSum(docs: EnrichedDoc[], key: (d: EnrichedDoc) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of docs) m.set(key(d), (m.get(key(d)) ?? 0) + d.saldo);
  return m;
}
