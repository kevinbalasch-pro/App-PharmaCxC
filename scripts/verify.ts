/**
 * Prueba el motor de ingesta contra los reportes reales que haya en la carpeta.
 *
 * No se afirman cifras concretas: los archivos cambian cada mes. Se afirman
 * invariantes que deben cumplirse siempre, y la más fuerte es que la suma
 * calculada coincida con la fila «Totales» del propio reporte.
 */
import * as fs from 'node:fs';
import * as XLSX from 'xlsx';
import { ingestWorkbook } from '../src/lib/ingest';
import { ROLE_LABEL } from '../src/lib/types';
import { todosLosCxC } from './fuentes';

XLSX.set_fs(fs);

let fails = 0;
const check = (name: string, ok: boolean, detalle = '') => {
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detalle ? `: ${detalle}` : ''}`);
};

const archivos = todosLosCxC();
if (archivos.length === 0) {
  console.log('No se encontró ningún reporte de cuentas por cobrar. Pasa la ruta como argumento.');
  process.exit(0);
}

console.log(`Reportes encontrados: ${archivos.length}`);

for (const ruta of archivos) {
  const nombre = ruta.split(/[\\/]/).pop()!;
  console.log(`\n${'='.repeat(72)}\n${nombre}`);
  const wb = XLSX.readFile(ruta, { cellDates: true });

  // Hojas que el motor considera de detalle, para comprobar que coinciden entre sí.
  const resultados = wb.SheetNames.map((sheetName) => {
    const { docs, diag } = ingestWorkbook(wb, nombre, { sheetName });
    return { sheetName, docs, diag, saldo: round2(docs.reduce((a, d) => a + d.saldo, 0)) };
  }).filter((r) => r.docs.length > 0);

  const elegida = ingestWorkbook(wb, nombre);
  console.log(
    `  hoja elegida: «${elegida.diag.sheetName}» · ${elegida.docs.length} documentos · ` +
      `${new Set(elegida.docs.map((d) => d.clienteNombre)).size} clientes · saldo ${round2(
        elegida.docs.reduce((a, d) => a + d.saldo, 0),
      )}`,
  );
  for (const m of elegida.diag.mapping) {
    console.log(`    ${m.columnLetter.padEnd(3)} -> ${ROLE_LABEL[m.role]}`);
  }
  for (const w of elegida.diag.warnings) console.log(`    aviso: ${w}`);

  check('la hoja elegida produce documentos', elegida.docs.length > 0, `${elegida.docs.length}`);
  check('todos los documentos tienen cliente', elegida.docs.every((d) => d.clienteNombre !== '(sin cliente)'));
  check('todos los documentos tienen número', elegida.docs.every((d) => d.numero !== ''));

  if (elegida.diag.reconciliation.length === 0) {
    console.log('    (el archivo no trae fila de totales: no hay contra qué reconciliar)');
  }
  for (const r of elegida.diag.reconciliation) {
    check(`reconcilia ${r.label}`, r.ok, `reporte=${r.reportado} calculado=${r.calculado}`);
  }

  // Si el libro trae la versión cruda y la ordenada a mano, deben coincidir.
  const conDetalle = resultados.filter((r) => r.docs.length >= elegida.docs.length * 0.9);
  if (conDetalle.length > 1) {
    const ref = conDetalle[0];
    for (const otra of conDetalle.slice(1)) {
      check(
        `«${otra.sheetName}» da lo mismo que «${ref.sheetName}»`,
        otra.docs.length === ref.docs.length && Math.abs(otra.saldo - ref.saldo) < 0.01,
        `${otra.docs.length} docs / ${otra.saldo} vs ${ref.docs.length} docs / ${ref.saldo}`,
      );
    }
  }
}

console.log(`\n${fails === 0 ? 'TODO OK' : `${fails} COMPROBACIONES FALLARON`}`);
process.exit(fails === 0 ? 0 : 1);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
