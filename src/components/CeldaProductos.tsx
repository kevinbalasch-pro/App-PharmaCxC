/**
 * Cuántos productos se listan antes de resumir el resto, en la vista compacta.
 * Cuatro, no más: los nombres reales rondan los 50 caracteres ("IMPLANTE
 * MAMARIO EUROSILICON 280 CC SMOOTH EXTRA ALTO"), así que seis ya hacían filas
 * de 14 líneas impresas.
 */
const TOPE = 4;

interface Props {
  productos: string[];
  /**
   * Lista uno por línea y sin tope. Se usa al desplegar un cliente, donde el
   * objetivo es ver el contenido completo de cada factura; cada nombre se
   * recorta a lo ancho en vez de envolver, para que la fila no crezca.
   */
  vertical?: boolean;
}

export function CeldaProductos({ productos, vertical = false }: Props) {
  if (productos.length === 0) return <td className="celda-productos">—</td>;

  if (vertical) {
    return (
      <td className="celda-productos vertical" title={productos.join('\n')}>
        {productos.map((p, i) => (
          <span className="producto-linea" key={`${p}-${i}`}>
            {p}
          </span>
        ))}
      </td>
    );
  }

  const visibles = productos.slice(0, TOPE);
  const resto = productos.length - visibles.length;

  return (
    <td className="celda-productos" title={productos.join('\n')}>
      {visibles.join(' · ')}
      {resto > 0 && <span className="productos-mas"> +{resto} más</span>}
    </td>
  );
}
