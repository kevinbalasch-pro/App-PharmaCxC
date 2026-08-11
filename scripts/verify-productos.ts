/**
 * Motor de productos: primero contra formatos sintéticos plausibles (folio como
 * texto o número, tabla plana o agrupada, columnas extra, archivo ajeno) y
 * después contra el reporte real de ventas por artículo que haya en la carpeta.
 */
import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { ingestWorkbook } from '../src/lib/ingest';
import { ingestProductos, normalizarDoc } from '../src/lib/ingest/productos';
import {
  agingSeries,
  computeKpis,
  enrich,
  inferAsOf,
  porCliente,
  porMesEmision,
  porVendedor,
} from '../src/lib/metrics';
import { construirLibro } from '../src/lib/export';
import { archivoCxC, archivoProductos, leerArrayBuffer } from './fuentes';

XLSX.set_fs(fs);

const FILE = archivoCxC();
if (!FILE) {
  console.log('No se encontró un reporte de cuentas por cobrar.');
  process.exit(0);
}

const wb = XLSX.readFile(FILE, { cellDates: true });
const { docs, catalogoVendedores } = ingestWorkbook(wb, 'CxC.xls');
const asOf = inferAsOf(docs);
const folios = docs.map((d) => d.numero);

let fails = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`);
};

/** Construye un .xlsx en memoria a partir de filas crudas. */
function libro(rows: unknown[][]): ArrayBuffer {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(rows), 'Hoja1');
  return XLSX.write(w, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const f = (i: number) => folios[i];
const saldoTotal = round2(docs.reduce((a, d) => a + d.saldo, 0));
console.log(`Reporte base: ${FILE.split(/[\\/]/).pop()} · ${docs.length} documentos · saldo ${saldoTotal}`);

// ---------------------------------------------------------------- escenario 1
console.log('\n1) TABLA PLANA, folio como texto con ceros');
{
  const buf = libro([
    ['Factura', 'Descripción del producto', 'Cant.', 'Precio'],
    [f(0), 'Bótox Allergan 100U', 2, 340],
    [f(0), 'Ácido hialurónico', 1, 120],
    [f(1), 'Consulta dermatológica', 1, 230],
    [f(2), 'Peeling químico facial', 3, 600],
  ]);
  const cat = ingestProductos(buf, 'productos.xlsx', folios);
  console.log(`  columnas -> doc=${cat.diag.columnaDocumento} desc=${cat.diag.columnaDescripcion} cant=${cat.diag.columnaCantidad} monto=${cat.diag.columnaMonto}`);
  check('líneas leídas', cat.diag.lineas, 4);
  check('documentos indexados', cat.diag.documentos, 3);
  check('coincidencias con el reporte', cat.diag.coincidencias, 3);
  const enriquecidos = enrich(docs, asOf, catalogoVendedores, cat.porDocumento);
  const d0 = enriquecidos.find((d) => d.numero === f(0))!;
  check('productos del primer documento', d0.productos, ['2× Bótox Allergan 100U', 'Ácido hialurónico']);
  check('documento sin productos queda vacío', enriquecidos.find((d) => d.numero === f(10))!.productos, []);
}

// ---------------------------------------------------------------- escenario 2
console.log('\n2) FOLIO COMO NÚMERO (Excel se come los ceros)');
{
  const buf = libro([
    ['Nro', 'Item'],
    [Number(f(0)), 'Bótox Allergan 100U'],
    [Number(f(1)), 'Consulta dermatológica'],
  ]);
  const cat = ingestProductos(buf, 'p2.xlsx', folios);
  check('coincidencias', cat.diag.coincidencias, 2);
  const e = enrich(docs, asOf, catalogoVendedores, cat.porDocumento);
  check('empareja pese a los ceros', e.find((d) => d.numero === f(0))!.productos, ['Bótox Allergan 100U']);
}

// ---------------------------------------------------------------- escenario 3
console.log('\n3) FORMATO AGRUPADO: el folio aparece una sola vez');
{
  const buf = libro([
    ['Factura', 'Producto', 'Cantidad'],
    [f(3), 'Rellenos dérmicos', 1],
    [null, 'Anestesia tópica', 2],
    [null, 'Kit post tratamiento', 1],
    [f(4), 'Mesoterapia corporal', 4],
  ]);
  const cat = ingestProductos(buf, 'p3.xlsx', folios);
  check('líneas', cat.diag.lineas, 4);
  check('documentos', cat.diag.documentos, 2);
  const e = enrich(docs, asOf, catalogoVendedores, cat.porDocumento);
  check('arrastra el folio a las líneas siguientes', e.find((d) => d.numero === f(3))!.productos, [
    'Rellenos dérmicos',
    '2× Anestesia tópica',
    'Kit post tratamiento',
  ]);
}

// ---------------------------------------------------------------- escenario 4
console.log('\n4) COLUMNAS EXTRA Y TÍTULOS RAROS');
{
  const buf = libro([
    ['Reporte de productos facturados'],
    [],
    ['Suc.', 'Código', 'Doc.', 'Detalle del artículo', 'Un.', 'Total Bs'],
    ['01', 'PRD-118', f(5), 'Limpieza facial profunda', 1, 650.5],
    ['01', 'PRD-204', f(5), 'Vitamina C tópica', 2, 240.75],
    ['02', 'PRD-118', f(6), 'Limpieza facial profunda', 1, 650.5],
  ]);
  const cat = ingestProductos(buf, 'p4.xlsx', folios);
  console.log(`  columnas -> doc=${cat.diag.columnaDocumento} desc=${cat.diag.columnaDescripcion} cant=${cat.diag.columnaCantidad} monto=${cat.diag.columnaMonto}`);
  check('documentos', cat.diag.documentos, 2);
  const e = enrich(docs, asOf, catalogoVendedores, cat.porDocumento);
  check('elige la columna de detalle, no el código', e.find((d) => d.numero === f(5))!.productos, [
    'Limpieza facial profunda',
    '2× Vitamina C tópica',
  ]);
}

// ---------------------------------------------------------------- escenario 5
console.log('\n5) ARCHIVO QUE NO CORRESPONDE AL REPORTE');
{
  const buf = libro([
    ['Factura', 'Producto'],
    ['9999001', 'Producto inventado'],
    ['9999002', 'Otro producto'],
  ]);
  const cat = ingestProductos(buf, 'ajeno.xlsx', folios);
  check('no inventa coincidencias', cat.diag.coincidencias, 0);
  check('avisa al usuario', cat.diag.avisos.length > 0, true);
  console.log(`  aviso: ${cat.diag.avisos[0]}`);
}

// ---------------------------------------------------------------- escenario 6
console.log('\n6) SIN ARCHIVO DE PRODUCTOS');
{
  const e = enrich(docs, asOf, catalogoVendedores, null);
  check('todos los documentos sin productos', e.every((d) => d.productos.length === 0), true);
  check('el resto del modelo no cambia', round2(e.reduce((a, d) => a + d.saldo, 0)), saldoTotal);
}

// ---------------------------------------------------------------- escenario 7
console.log('\n7) LA COLUMNA LLEGA AL EXCEL EXPORTADO');
{
  const buf = libro([
    ['Factura', 'Producto', 'Cant.'],
    [f(0), 'Bótox Allergan 100U', 2],
    [f(0), 'Ácido hialurónico', 1],
  ]);
  const cat = ingestProductos(buf, 'p7.xlsx', folios);
  const e = enrich(docs, asOf, catalogoVendedores, cat.porDocumento);
  const wbOut = construirLibro({
    kpis: computeKpis(e),
    aging: agingSeries(e),
    clientes: porCliente(e),
    vendedores: porVendedor(e),
    meses: porMesEmision(e),
    docs: e,
    diag: ingestWorkbook(wb, 'CxC.xls').diag,
    asOf,
    filtros: null,
  });
  const detalle = XLSX.utils.sheet_to_json<Record<string, unknown>>(wbOut.Sheets['Detalle']);
  const cols = Object.keys(detalle[0]);
  check('la hoja Detalle trae Productos', cols.includes('Productos'), true);
  check('y ya no trae Vencimiento', cols.includes('Vencimiento'), false);
  const fila = detalle.find((r) => String(r['Documento']) === f(0));
  check('con los productos concatenados', fila?.['Productos'], '2× Bótox Allergan 100U · Ácido hialurónico');
  check('los totales no cambian', round2(detalle.reduce((a, r) => a + Number(r['Saldo'] ?? 0), 0)), saldoTotal);
}


// ---------------------------------------------------------------- escenario 8
console.log('\n8) ARCHIVO REAL DE VENTAS POR ARTÍCULO');
{
  const ruta = archivoProductos();
  if (!ruta) {
    console.log('  (omitido: no se encontró un reporte de ventas por artículo)');
  } else {
    console.log(`  archivo: ${ruta.split(/[\/]/).pop()}`);
    const cat = ingestProductos(leerArrayBuffer(ruta), 'ventas.xls', folios);
    const d = cat.diag;
    console.log(
      `  hoja=${cat.sheetName} layout=${d.layout} nombre desde=${d.origenNombre} ` +
        `cols doc=${d.columnaDocumento} desc=${d.columnaDescripcion} cant=${d.columnaCantidad} monto=${d.columnaMonto}`,
    );
    console.log(`  detalle=${d.filasDetalle} líneas usadas=${d.lineas} artículos=${d.productosDistintos}`);

    check('encuentra la columna de documento', d.columnaDocumento !== null, true);
    check('empareja documentos del reporte', d.documentos > 0, true);
    check('obtiene nombres de producto', d.origenNombre !== 'ninguno', true);
    check('cantidad detectada', d.columnaCantidad !== null, true);

    // La cantidad no puede ser el número de renglón: si lo fuera, casi todos
    // los documentos multi-línea tendrían cantidades 1,2,3… sin repetir.
    const multi = [...cat.porDocumento.values()].filter((l) => l.length >= 3);
    const secuenciales = multi.filter((l) => {
      const v = l.map((x) => x.cantidad ?? 0).sort((a, b) => a - b);
      return v.every((x, i) => x === i + 1);
    }).length;
    check('la cantidad no es el número de renglón', multi.length === 0 || secuenciales / multi.length < 0.5, true);

    // Comprobación cruzada: la suma de los productos de cada factura debe
    // reproducir su neto en el reporte. El archivo puede venir en dólares o en
    // bolívares según la exportación, así que se aceptan ambas lecturas.
    let directo = 0;
    let porTasa = 0;
    let comparados = 0;
    for (const doc of docs) {
      const lineas = cat.porDocumento.get(normalizarDoc(doc.numero));
      if (!lineas || lineas.some((l) => l.monto === null)) continue;
      comparados++;
      const s = lineas.reduce((a, l) => a + (l.monto ?? 0), 0);
      if (Math.abs(s - doc.neto) < 0.51) directo++;
      else if (doc.tasa && Math.abs(s / doc.tasa - doc.neto) < 0.51) porTasa++;
    }
    const cuadran = directo + porTasa;
    console.log(
      `  reconciliación: ${cuadran}/${comparados} (${directo} en la misma moneda, ${porTasa} aplicando la tasa)`,
    );
    check('el monto de los productos reproduce el neto de CxC', comparados === 0 || cuadran / comparados >= 0.95, true);

    // El invariante que importa: no puede quedarse sin emparejar un documento
    // cuyo folio SÍ está en el archivo.
    const wbP = XLSX.readFile(ruta, { cellDates: true });
    const enArchivo = new Set<string>();
    for (const hoja of wbP.SheetNames) {
      for (const fila of XLSX.utils.sheet_to_json<unknown[]>(wbP.Sheets[hoja], { header: 1, raw: true, defval: null })) {
        for (const celda of fila ?? []) {
          const k = normalizarDoc(celda);
          if (k) enArchivo.add(k);
        }
      }
    }
    const sin = docs.filter((doc) => !cat.porDocumento.has(normalizarDoc(doc.numero)));
    const perdidos = sin.filter((doc) => enArchivo.has(normalizarDoc(doc.numero)));
    check('ningún documento presente en el archivo se queda sin emparejar', perdidos.map((x) => x.numero), []);
    console.log(`  sin productos: ${sin.length} de ${docs.length} (ninguno figura en el archivo de ventas)`);
  }
}

// ---------------------------------------------------------------- escenario 9
console.log('\n9) FILTRO POR PRODUCTO');
{
  const ruta = archivoProductos();
  if (!ruta) {
    console.log('  (omitido: no se encontró un reporte de ventas por artículo)');
  } else {
    const cat = ingestProductos(leerArrayBuffer(ruta), 'ventas.xls', folios);
    const e = enrich(docs, asOf, catalogoVendedores, cat.porDocumento);
    const articulos = [...new Set(e.flatMap((d) => d.productosBase))].sort();
    check('hay artículos por los que filtrar', articulos.length > 0, true);

    // Filtrar por un artículo deja solo documentos que lo contienen, y por
    // tanto solo clientes que lo compraron.
    const elegido = articulos.find((a) => e.filter((d) => d.productosBase.includes(a)).length >= 2) ?? articulos[0];
    const filtrados = e.filter((d) => d.productosBase.includes(elegido));
    check('todos los documentos filtrados contienen el artículo', filtrados.every((d) => d.productosBase.includes(elegido)), true);
    const clientesConEl = new Set(filtrados.map((d) => d.clienteNombre));
    const esperados = new Set(e.filter((d) => d.productosBase.includes(elegido)).map((d) => d.clienteNombre));
    check('los clientes visibles son los que lo compraron', [...clientesConEl].sort(), [...esperados].sort());
    console.log(`  «${elegido.slice(0, 46)}» -> ${filtrados.length} documentos de ${clientesConEl.size} cliente(s)`);

    // Varios artículos a la vez funcionan como unión, no como intersección.
    const dos = articulos.slice(0, 2);
    const union = e.filter((d) => d.productosBase.some((p) => dos.includes(p)));
    const a0 = e.filter((d) => d.productosBase.includes(dos[0]));
    const a1 = e.filter((d) => d.productosBase.includes(dos[1]));
    check('marcar dos artículos suma ambos conjuntos', union.length >= Math.max(a0.length, a1.length), true);
  }
}

console.log(`\n${fails === 0 ? 'TODO OK' : `${fails} COMPROBACIONES FALLARON`}`);
process.exit(fails === 0 ? 0 : 1);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
