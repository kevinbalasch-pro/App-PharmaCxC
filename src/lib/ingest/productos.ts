import * as XLSX from 'xlsx';
import { isBlank, norm, text, toNumber, type Row } from './cells';
import { classifyRows, type ClassifiedRow } from './rows';
import { profileColumn } from './profile';

/** "0000004188" y 4188 deben resolver a la misma clave. */
export function normalizarDoc(v: unknown): string {
  const t = text(v).toUpperCase().replace(/\s+/g, '');
  if (!t) return '';
  return /^\d+$/.test(t) ? String(Number(t)) : t.replace(/^0+(?=.)/, '');
}

export interface LineaProducto {
  documento: string;
  descripcion: string;
  cantidad: number | null;
  monto: number | null;
}

export type OrigenNombre = 'columna' | 'grupo' | 'ninguno';

export interface CatalogoProductos {
  fileName: string;
  sheetName: string;
  /** Clave: número de documento normalizado. */
  porDocumento: Map<string, LineaProducto[]>;
  diag: {
    hojas: string[];
    layout: 'plana' | 'agrupada';
    filasDetalle: number;
    lineas: number;
    documentos: number;
    productosDistintos: number;
    /** Documentos del reporte de CxC que encontraron productos. */
    coincidencias: number;
    documentosDelReporte: number;
    origenNombre: OrigenNombre;
    columnaDocumento: string | null;
    columnaDescripcion: string | null;
    columnaCantidad: string | null;
    columnaMonto: string | null;
    lineasIgnoradas: number;
    avisos: string[];
  };
}

const letra = (i: number): string => {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

/**
 * Elige la columna de documento por coincidencia real contra los folios del
 * reporte de cuentas por cobrar. Es una señal mucho más fuerte que el título:
 * o los números casan o no casan.
 */
function mejorColumnaDocumento(detalle: Row[], conocidos: Set<string>): { col: number; aciertos: number } {
  const width = Math.max(0, ...detalle.map((r) => r.length));
  let col = -1;
  let aciertos = 0;
  for (let i = 0; i < width; i++) {
    let hit = 0;
    for (const r of detalle) {
      const k = normalizarDoc(r[i]);
      if (k && conocidos.has(k)) hit++;
    }
    if (hit > aciertos) {
      aciertos = hit;
      col = i;
    }
  }
  return { col, aciertos };
}

/**
 * La descripción es texto con varias palabras. El requisito de espacios es
 * clave: distingue un nombre de producto ("LOCION CALMANTE CAPILAR") de un
 * código de cliente ("V071303499"), que también es texto largo.
 */
function mejorColumnaDescripcion(detalle: Row[], excluir: number[]): number {
  const width = Math.max(0, ...detalle.map((r) => r.length));
  let mejor = -1;
  let puntaje = 0;
  for (let i = 0; i < width; i++) {
    if (excluir.includes(i)) continue;
    const p = profileColumn(detalle, i);
    if (p.filled === 0 || p.strRatio < 0.7 || p.dateRatio > 0.3) continue;
    if (p.avgLen < 8) continue;
    const conEspacio = p.values.filter((v) => text(v).includes(' ')).length / p.filled;
    if (conEspacio < 0.5) continue;
    const s = p.avgLen * conEspacio * p.fillRatio;
    if (s > puntaje) {
      puntaje = s;
      mejor = i;
    }
  }
  return mejor;
}

/**
 * ¿La columna es el número de renglón del documento y no una cantidad?
 *
 * Ambas son enteros pequeños y la forma sola no las separa. Lo que sí las
 * separa: los renglones de un documento son la secuencia 1..n. Una cantidad
 * casi nunca lo es.
 */
function pareceRenglon(detalle: Row[], colDoc: number, col: number): boolean {
  const porDoc = new Map<string, number[]>();
  for (const r of detalle) {
    const d = normalizarDoc(r[colDoc]);
    const v = toNumber(r[col]);
    if (!d || v === null || !Number.isInteger(v)) continue;
    porDoc.set(d, [...(porDoc.get(d) ?? []), v]);
  }
  const grupos = [...porDoc.values()].filter((v) => v.length >= 3);
  if (grupos.length < 3) return false;
  const consecutivos = grupos.filter((v) => {
    const s = [...v].sort((a, b) => a - b);
    return s.every((x, k) => x === k + 1);
  }).length;
  return consecutivos / grupos.length >= 0.5;
}

const PISTA_CANTIDAD = /\b(cantidad|cant|qty|piezas|unidades)\b/;
const PISTA_MONTO = /\b(neto|total|monto|importe|subtotal)\b/;
const PISTA_EVITAR = /\b(reng|renglon|linea|item|orden|correlativo|precio unitario)\b/;

function columnaNumerica(
  detalle: Row[],
  excluir: number[],
  preferirEnteros: boolean,
  headers: string[],
  colDoc: number,
): number {
  const width = Math.max(0, ...detalle.map((r) => r.length));
  let mejor = -1;
  let puntaje = 0;
  for (let i = 0; i < width; i++) {
    if (excluir.includes(i)) continue;
    const p = profileColumn(detalle, i);
    if (p.numRatio < 0.8 || p.filled === 0 || p.dateRatio > 0.3) continue;
    // "01", "02" son códigos de sucursal, no cantidades: nadie escribe un
    // conteo con ceros a la izquierda.
    if (p.leadingZeroRatio > 0.2) continue;
    if (preferirEnteros && pareceRenglon(detalle, colDoc, i)) continue;

    const h = headers[i] ?? '';
    const pista = (preferirEnteros ? PISTA_CANTIDAD : PISTA_MONTO).test(h) ? 1 : 0;
    const castigo = PISTA_EVITAR.test(h) ? 1.5 : 0;
    const enteros = 1 - p.decimalRatio;
    const forma = preferirEnteros
      ? enteros + (p.absMean > 0 && p.absMean < 100 ? 0.5 : 0)
      : p.decimalRatio + (p.absMean > 10 ? 0.5 : 0);
    const s = forma + p.fillRatio + pista - castigo;
    if (s > puntaje) {
      puntaje = s;
      mejor = i;
    }
  }
  return mejor;
}

/** De una fila dispersa toma el texto más largo como nombre del producto. */
function nombreDeGrupo(r: Row): string {
  const textos = r.filter((c) => !isBlank(c)).map(text);
  let mejor = '';
  for (const t of textos) {
    if (/[a-záéíóúñ]{3,}/i.test(t) && t.length > mejor.length) mejor = t;
  }
  return mejor;
}

interface Candidata {
  sheetName: string;
  cls: ClassifiedRow[];
  detalle: Row[];
  colDoc: number;
  aciertos: number;
}

/**
 * Lee un libro de productos y lo indexa por número de documento.
 * `documentosConocidos` son los folios del reporte de cuentas por cobrar.
 */
export function ingestProductos(
  buf: ArrayBuffer,
  fileName: string,
  documentosConocidos: string[],
): CatalogoProductos {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const conocidos = new Set(documentosConocidos.map(normalizarDoc).filter(Boolean));
  const avisos: string[] = [];

  let mejor: Candidata | null = null;
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const { rows: cls } = classifyRows(rows);
    const detalle = cls.filter((c) => c.kind === 'detalle').map((c) => c.row);
    if (detalle.length === 0) continue;
    const { col, aciertos } = mejorColumnaDocumento(detalle, conocidos);
    if (col < 0) continue;
    if (!mejor || aciertos > mejor.aciertos) mejor = { sheetName, cls, detalle, colDoc: col, aciertos };
  }

  if (!mejor || mejor.aciertos === 0) {
    avisos.push(
      'Ninguna columna del archivo coincide con los números de documento del reporte. ' +
        'Revisa que la columna de factura use los mismos folios.',
    );
    return {
      fileName,
      sheetName: wb.SheetNames[0] ?? '',
      porDocumento: new Map(),
      diag: {
        hojas: wb.SheetNames,
        layout: 'plana',
        filasDetalle: 0,
        lineas: 0,
        documentos: 0,
        productosDistintos: 0,
        coincidencias: 0,
        documentosDelReporte: conocidos.size,
        origenNombre: 'ninguno',
        columnaDocumento: null,
        columnaDescripcion: null,
        columnaCantidad: null,
        columnaMonto: null,
        lineasIgnoradas: 0,
        avisos,
      },
    };
  }

  const { sheetName, cls, detalle, colDoc } = mejor;
  const anchoHoja = Math.max(0, ...detalle.map((r) => r.length));
  const filaEncabezado = cls.find((c) => c.kind === 'encabezado')?.row ?? [];
  const headers: string[] = [];
  for (let i = 0; i < anchoHoja; i++) headers.push(norm(text(filaEncabezado[i])));

  const colDesc = mejorColumnaDescripcion(detalle, [colDoc]);
  const colCant = columnaNumerica(detalle, [colDoc, colDesc], true, headers, colDoc);
  const colMonto = columnaNumerica(detalle, [colDoc, colDesc, colCant], false, headers, colDoc);
  const hayGrupos = cls.some((c) => c.kind === 'grupo');

  const origenNombre: OrigenNombre = colDesc >= 0 ? 'columna' : hayGrupos ? 'grupo' : 'ninguno';
  if (origenNombre === 'ninguno') {
    avisos.push('No se encontró el nombre del producto: se listarán las líneas sin descripción.');
  }

  const porDocumento = new Map<string, LineaProducto[]>();
  const nombres = new Set<string>();
  let productoActual = '';
  let ultimoDoc = '';
  let lineas = 0;
  let ignoradas = 0;

  // Se recorre en orden: las filas dispersas fijan el producto vigente para
  // las filas de detalle que vienen debajo.
  for (const c of cls) {
    if (c.kind === 'grupo') {
      const n = nombreDeGrupo(c.row);
      if (n) productoActual = n;
      continue;
    }
    if (c.kind !== 'detalle') continue;

    const propio = normalizarDoc(c.row[colDoc]);
    // Una fila solo cuenta si su folio es del reporte, o si viene en blanco y
    // hereda el anterior. Eso descarta encabezados, totales y facturas de
    // otros períodos sin depender de listas de palabras.
    if (propio && !conocidos.has(propio)) {
      ignoradas++;
      continue;
    }
    const doc = propio || ultimoDoc;
    if (propio) ultimoDoc = propio;
    if (!doc) continue;

    const descripcion = (colDesc >= 0 ? text(c.row[colDesc]) : productoActual) || '(sin nombre)';
    nombres.add(descripcion);

    porDocumento.set(doc, [
      ...(porDocumento.get(doc) ?? []),
      {
        documento: doc,
        descripcion,
        cantidad: colCant >= 0 ? toNumber(c.row[colCant]) : null,
        monto: colMonto >= 0 ? toNumber(c.row[colMonto]) : null,
      },
    ]);
    lineas++;
  }

  const coincidencias = porDocumento.size;
  if (coincidencias === 0) {
    avisos.push('Se leyeron productos pero ninguno corresponde a un documento del reporte actual.');
  } else if (coincidencias < conocidos.size) {
    avisos.push(
      `${conocidos.size - coincidencias} de ${conocidos.size} documentos del reporte no tienen productos en este archivo.`,
    );
  }

  return {
    fileName,
    sheetName,
    porDocumento,
    diag: {
      hojas: wb.SheetNames,
      layout: hayGrupos ? 'agrupada' : 'plana',
      filasDetalle: detalle.length,
      lineas,
      documentos: coincidencias,
      productosDistintos: nombres.size,
      coincidencias,
      documentosDelReporte: conocidos.size,
      origenNombre,
      columnaDocumento: letra(colDoc),
      columnaDescripcion: colDesc >= 0 ? letra(colDesc) : null,
      columnaCantidad: colCant >= 0 ? letra(colCant) : null,
      columnaMonto: colMonto >= 0 ? letra(colMonto) : null,
      lineasIgnoradas: ignoradas,
      avisos,
    },
  };
}
