/**
 * Catálogo de vendedores: código del ERP -> nombre.
 *
 * Para mantenerlo, edita solo este objeto. Las claves van sin ceros a la
 * izquierda ("4", no "004"): la normalización se encarga del resto, así que
 * "4", "04" y "004" resuelven al mismo nombre.
 *
 * Dos códigos pueden apuntar a la misma persona (7 y 8 son Ada). En ese caso
 * el dashboard suma sus carteras en una sola fila y muestra ambos códigos.
 */
export const VENDEDORES: Record<string, string> = {
  '4': 'Beatriz',
  '5': 'Mayra',
  '7': 'Ada',
  '8': 'Ada',
  '9': 'Glemin',
  '10': 'Sheyla',
  '12': 'Lorena',
  '13': 'Mariela',
  '14': 'Martina',
  '16': 'Sara',
  KB: 'Kevin',
};

/** "004" -> "4", " kb " -> "KB". */
export function normalizarCodigo(codigo: string): string {
  const c = codigo.trim().toUpperCase();
  return /^\d+$/.test(c) ? String(Number(c)) : c;
}

export type Catalogo = Record<string, string>;

/**
 * Devuelve el nombre del vendedor. `extra` (normalmente leído del propio Excel)
 * tiene prioridad sobre el catálogo de este archivo. Si el código no está en
 * ninguno, se muestra tal cual para no ocultar información.
 */
export function nombreVendedor(codigo: string, extra?: Catalogo | null): string {
  const c = normalizarCodigo(codigo);
  return extra?.[c] ?? VENDEDORES[c] ?? (codigo.trim() || 'Sin asignar');
}

/** Códigos presentes en los datos que no resuelven a ningún nombre. */
export function codigosDesconocidos(codigos: string[], extra?: Catalogo | null): string[] {
  return [...new Set(codigos.map(normalizarCodigo))]
    .filter((c) => c !== 'N/D' && !(extra && c in extra) && !(c in VENDEDORES))
    .sort();
}

const esCodigo = (v: unknown): boolean => {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v < 100000;
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.length > 0 && s.length <= 8 && !/\s/.test(s) && /^[a-z0-9\-/]+$/i.test(s);
};

const esNombre = (v: unknown): boolean => {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.length >= 3 && s.length <= 40 && /[a-záéíóúñ]{3,}/i.test(s) && !/^total/i.test(s);
};

/**
 * Busca en una hoja auxiliar un par de columnas «código -> nombre».
 *
 * Se prueban todas las combinaciones de columnas y gana la que produce más
 * pares válidos, prefiriendo columnas contiguas. Así funciona aunque la tabla
 * esté en medio de la hoja, tenga títulos o arrastre columnas sueltas.
 */
export function detectarCatalogoEnFilas(rows: unknown[][]): Catalogo | null {
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width < 2) return null;

  // Una tabla de referencia es pequeña y casi todas sus filas son pares válidos.
  // Sin esta guarda, una hoja de detalle con columnas «código de cliente / nombre»
  // se confundiría con un catálogo de vendedores.
  const filasConDatos = rows.filter((r) => r.some((c) => c !== null && c !== undefined && c !== '')).length;
  if (filasConDatos === 0 || filasConDatos > 200) return null;

  let best: { pares: [string, string][]; adyacente: boolean } | null = null;

  for (let a = 0; a < width; a++) {
    for (let b = 0; b < width; b++) {
      if (a === b) continue;
      const pares: [string, string][] = [];
      for (const r of rows) {
        if (esCodigo(r[a]) && esNombre(r[b])) pares.push([normalizarCodigo(String(r[a])), String(r[b]).trim()]);
      }
      if (pares.length < 3) continue;
      const adyacente = b === a + 1;
      const mejor =
        !best ||
        pares.length > best.pares.length ||
        (pares.length === best.pares.length && adyacente && !best.adyacente);
      if (mejor) best = { pares, adyacente };
    }
  }
  if (!best) return null;
  if (best.pares.length / filasConDatos < 0.5) return null;

  const mapa: Catalogo = {};
  for (const [c, n] of best.pares) mapa[c] = n;
  return Object.keys(mapa).length >= 3 ? mapa : null;
}
