import { fecha } from '../lib/format';
import type { Diagnostics } from '../lib/types';

interface Props {
  diag: Diagnostics;
  asOf: Date;
  filtros: string | null;
  vista: string;
  documentos: number;
  total: number;
}

/**
 * Portada que solo aparece al imprimir o guardar como PDF. Deja constancia de
 * qué archivo, qué corte y qué filtros produjeron los números de la hoja.
 */
export function PrintHeader({ diag, asOf, filtros, vista, documentos, total }: Props) {
  const generado = new Date();
  return (
    <div className="solo-impresion print-header">
      <h1>Cuentas por Cobrar</h1>
      <table>
        <tbody>
          <tr>
            <th>Archivo</th>
            <td>
              {diag.fileName} · hoja «{diag.sheetName}»
            </td>
            <th>Fecha de corte</th>
            <td>{fecha(asOf)}</td>
          </tr>
          <tr>
            <th>Agrupación</th>
            <td>{vista}</td>
            <th>Generado</th>
            <td>
              {fecha(generado)}{' '}
              {generado.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
            </td>
          </tr>
          <tr>
            <th>Filtros</th>
            <td colSpan={3}>{filtros ?? 'Ninguno · cartera completa'}</td>
          </tr>
          <tr>
            <th>Alcance</th>
            <td colSpan={3}>
              {documentos === total
                ? `${total} documentos`
                : `${documentos} de ${total} documentos`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
