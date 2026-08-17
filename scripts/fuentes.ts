/**
 * Localiza los archivos de trabajo. Los reportes cambian de nombre cada mes
 * ("CxC 30 Julio", "CxC_10_Agosto_Completas_2026"…), así que se busca por
 * patrón y se toma el más reciente en vez de fijar una ruta.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const CARPETA =
  process.env.CXC_DIR ??
  'C:/Users/Kevin Balasch/Documents/Kevin/Pharmaesthetic/Cosas oficina/Cuentas por Cobrar';

const EXT = /\.(xls|xlsx|xlsm)$/i;

function buscar(dir: string, quiere: (nombre: string) => boolean, profundidad = 2): string[] {
  if (!fs.existsSync(dir) || profundidad < 0) return [];
  const salida: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) salida.push(...buscar(p, quiere, profundidad - 1));
    else if (EXT.test(e.name) && !e.name.startsWith('~$') && quiere(e.name)) salida.push(p);
  }
  return salida;
}

const masReciente = (rutas: string[]): string | null =>
  rutas.length === 0
    ? null
    : rutas.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const esCxC = (n: string): boolean => /^cxc/i.test(n) && !/prueba/i.test(n);
// El reporte ha venido como "VentasxArticulo" y como "FacturasxArticulo": lo que
// no cambia es que va "por artículo".
const esProductos = (n: string): boolean => /articulo/i.test(n.replace(/[_\s]/g, '')) && !esCxC(n);

/** Reporte de cuentas por cobrar. `argv[2]` gana sobre la búsqueda. */
export function archivoCxC(): string | null {
  return process.argv[2] && EXT.test(process.argv[2]) ? process.argv[2] : masReciente(buscar(CARPETA, esCxC));
}

/** Reporte de ventas por artículo. `argv[3]` gana sobre la búsqueda. */
export function archivoProductos(): string | null {
  return process.argv[3] && EXT.test(process.argv[3])
    ? process.argv[3]
    : masReciente(buscar(CARPETA, esProductos));
}

/** Todos los reportes de CxC encontrados, para probar contra varios meses. */
export function todosLosCxC(): string[] {
  return buscar(CARPETA, esCxC).sort();
}

export function leerArrayBuffer(ruta: string): ArrayBuffer {
  const b = fs.readFileSync(ruta);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
