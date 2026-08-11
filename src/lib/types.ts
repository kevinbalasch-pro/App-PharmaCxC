export type Role =
  | 'clienteCodigo'
  | 'clienteNombre'
  | 'tipoDoc'
  | 'numero'
  | 'emision'
  | 'vencimiento'
  | 'vendedor'
  | 'neto'
  | 'saldo'
  | 'moneda'
  | 'tasa'
  | 'observacion';

export const ROLE_LABEL: Record<Role, string> = {
  clienteCodigo: 'Código de cliente',
  clienteNombre: 'Nombre de cliente',
  tipoDoc: 'Tipo de documento',
  numero: 'Número de documento',
  emision: 'Fecha de emisión',
  vencimiento: 'Fecha de vencimiento',
  vendedor: 'Vendedor',
  neto: 'Monto original (neto)',
  saldo: 'Saldo pendiente',
  moneda: 'Moneda',
  tasa: 'Tasa de cambio',
  observacion: 'Observación',
};

/** Roles sin los cuales no se puede construir el dashboard. */
export const REQUIRED_ROLES: Role[] = ['clienteNombre', 'saldo'];

export interface ARDoc {
  clienteCodigo: string;
  clienteNombre: string;
  tipoDoc: string;
  numero: string;
  emision: Date | null;
  vencimiento: Date | null;
  vendedor: string;
  neto: number;
  saldo: number;
  moneda: string;
  tasa: number | null;
}

export interface ColumnMapping {
  index: number;
  columnLetter: string;
  role: Role;
  score: number;
  headerText: string;
  evidence: string;
}

export interface ReconCheck {
  label: string;
  reportado: number;
  calculado: number;
  delta: number;
  ok: boolean;
}

export interface SheetScore {
  name: string;
  score: number;
  reason: string;
}

export interface Diagnostics {
  fileName: string;
  sheetName: string;
  sheetScores: SheetScore[];
  layout: 'plana' | 'agrupada';
  rowCounts: {
    total: number;
    detalle: number;
    grupo: number;
    totales: number;
    encabezado: number;
    ruido: number;
    vacia: number;
  };
  mapping: ColumnMapping[];
  unmappedRoles: Role[];
  headerOffset: number;
  warnings: string[];
  reconciliation: ReconCheck[];
  descartadas: { fila: number; motivo: string; contenido: string }[];
  /** Tabla código -> nombre de vendedor hallada en otra hoja del mismo libro. */
  catalogoVendedores: { hoja: string; entradas: number } | null;
}

export interface Dataset {
  docs: ARDoc[];
  diag: Diagnostics;
  /** Catálogo leído del archivo; tiene prioridad sobre el catálogo del código. */
  catalogoVendedores: Record<string, string> | null;
}
