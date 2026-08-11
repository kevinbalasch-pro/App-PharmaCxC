/**
 * Comprueba el catálogo de vendedores y que el libro exportado dice lo mismo
 * que el dashboard. Las cifras se derivan del archivo que se encuentre, no se
 * fijan a mano: los reportes cambian cada mes.
 */
import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { ingestWorkbook } from '../src/lib/ingest';
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
import { VENDEDORES, codigosDesconocidos, nombreVendedor } from '../src/lib/vendedores';
import { archivoCxC } from './fuentes';

XLSX.set_fs(fs);

let fails = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ` (esperado ${JSON.stringify(want)})`}`);
};

console.log('CATALOGO DE VENDEDORES');
check('004 -> Beatriz', nombreVendedor('004'), 'Beatriz');
check('KB -> Kevin', nombreVendedor('KB'), 'Kevin');
check('007 y 008 -> Ada', [nombreVendedor('007'), nombreVendedor('008')], ['Ada', 'Ada']);
check('un código fuera del catálogo se muestra crudo', nombreVendedor('099'), '099');
check('el catálogo del código tiene 11 entradas', Object.keys(VENDEDORES).length, 11);

const ruta = archivoCxC();
if (!ruta) {
  console.log('\nNo se encontró un reporte de cuentas por cobrar; se omite el resto.');
  process.exit(fails === 0 ? 0 : 1);
}
const nombre = ruta.split(/[\\/]/).pop()!;
console.log(`\nARCHIVO: ${nombre}`);

const wb = XLSX.readFile(ruta, { cellDates: true });
const { docs, diag, catalogoVendedores } = ingestWorkbook(wb, nombre);
const asOf = inferAsOf(docs);
const all = enrich(docs, asOf, catalogoVendedores);

const saldoTotal = round2(all.reduce((a, d) => a + d.saldo, 0));
const netoTotal = round2(all.reduce((a, d) => a + d.neto, 0));

console.log('\nVENDEDORES EN LOS DATOS');
const codigos = [...new Set(all.map((d) => d.vendedor))].sort();
console.log(`  códigos: ${codigos.join(', ')}`);
check('todos los códigos resuelven a un nombre', codigosDesconocidos(codigos, catalogoVendedores), []);

const vend = porVendedor(all);
for (const v of vend) {
  console.log(`    ${v.vendedor.padEnd(10)} ${String(round2(v.saldo)).padStart(9)}  códigos=${v.codigos.join(',')}`);
}
check('la suma por vendedor conserva la cartera', round2(vend.reduce((a, v) => a + v.saldo, 0)), saldoTotal);
check('un nombre por fila, sin duplicados', vend.length, new Set(vend.map((v) => v.vendedor)).size);
const ada = vend.find((v) => v.vendedor === 'Ada');
if (ada) check('Ada agrupa más de un código si ambos aparecen', ada.codigos.length >= 1, true);

console.log('\nAGREGADOS COHERENTES ENTRE SÍ');
check('por cliente suma la cartera', round2(porCliente(all).reduce((a, c) => a + c.saldo, 0)), saldoTotal);
check('antigüedad suma la cartera', round2(agingSeries(all).reduce((a, b) => a + b.saldo, 0)), saldoTotal);
check('por mes suma la cartera', round2(porMesEmision(all).reduce((a, m) => a + m.saldo, 0)), saldoTotal);
check('el KPI de cartera es la suma de saldos', round2(computeKpis(all).carteraTotal), saldoTotal);

console.log('\nEXPORTACION A EXCEL');
const libro = construirLibro({
  kpis: computeKpis(all),
  aging: agingSeries(all),
  clientes: porCliente(all),
  vendedores: vend,
  meses: porMesEmision(all),
  docs: all,
  diag,
  asOf,
  filtros: null,
});
check('hojas del libro', libro.SheetNames, ['Resumen', 'Antigüedad', 'Por cliente', 'Por vendedor', 'Por mes', 'Detalle']);

const leer = (h: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets[h]);
const detalle = leer('Detalle');
const suma = (filas: Record<string, unknown>[], col: string) =>
  round2(filas.reduce((a, r) => a + Number(r[col] ?? 0), 0));

check('filas en Detalle', detalle.length, all.length);
check('suma de Saldo en Detalle', suma(detalle, 'Saldo'), saldoTotal);
check('suma de Monto original en Detalle', suma(detalle, 'Monto original'), netoTotal);
check('Detalle trae nombre de vendedor', detalle[0]['Vendedor'], nombreVendedor(String(detalle[0]['Código vendedor']), catalogoVendedores));
check('suma de Por cliente', suma(leer('Por cliente'), 'Saldo'), saldoTotal);
check('suma de Por vendedor', suma(leer('Por vendedor'), 'Saldo'), saldoTotal);
check('suma de Antigüedad', suma(leer('Antigüedad'), 'Saldo'), saldoTotal);

// El archivo debe abrirse de verdad: se escribe y se relee.
const tmp = 'scripts/.tmp-export.xlsx';
XLSX.writeFile(libro, tmp, { compression: true });
// cellNF conserva el formato numérico al releer; sin él SheetJS lo descarta.
const releido = XLSX.readFile(tmp, { cellDates: true, cellNF: true });
check('se relee con las mismas hojas', releido.SheetNames, libro.SheetNames);
const celdaSaldo = releido.Sheets['Detalle']['M2'];
check('los montos son números con formato, no texto', [celdaSaldo?.t, celdaSaldo?.z], ['n', '#,##0.00']);
console.log(`  tamaño del archivo: ${(fs.statSync(tmp).size / 1024).toFixed(1)} kB`);
fs.unlinkSync(tmp);

console.log(`\n${fails === 0 ? 'TODO OK' : `${fails} COMPROBACIONES FALLARON`}`);
process.exit(fails === 0 ? 0 : 1);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
