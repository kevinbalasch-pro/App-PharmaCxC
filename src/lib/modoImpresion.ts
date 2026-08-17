import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * `true` mientras el navegador prepara la impresión.
 *
 * Sirve para dar a las gráficas una altura menor en papel. No se puede hacer
 * con CSS: Recharts mide el SVG al renderizar y no vuelve a medirlo cuando
 * cambia la media query, así que bajar la altura por hoja de estilos solo
 * consigue que el gráfico se desborde de su tarjeta. Pasándola como prop, el
 * alto entra en el render y `flushSync` obliga a que ocurra antes de que el
 * navegador capture la página.
 */
export function useModoImpresion(): boolean {
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    const activar = () => {
      flushSync(() => setImprimiendo(true));
    };
    const desactivar = () => setImprimiendo(false);

    window.addEventListener('beforeprint', activar);
    window.addEventListener('afterprint', desactivar);

    // Safari no dispara beforeprint; ahí el aviso llega por la media query.
    const mq = window.matchMedia('print');
    const alCambiar = (e: MediaQueryListEvent) => (e.matches ? activar() : desactivar());
    mq.addEventListener('change', alCambiar);

    return () => {
      window.removeEventListener('beforeprint', activar);
      window.removeEventListener('afterprint', desactivar);
      mq.removeEventListener('change', alCambiar);
    };
  }, []);

  return imprimiendo;
}

/**
 * Alto del área de dibujo según el destino.
 *
 * Las medidas de impresión están calculadas para que dos gráficas cualesquiera
 * entren en una hoja A4 junto a la portada y los indicadores (~193 px), incluso
 * con los márgenes y el encabezado que Chrome añade por su cuenta. El peor caso
 * son las dos gráficas altas juntas: 2 × 333 + 193 = 859 px.
 */
export function altoGrafica(alta: boolean, imprimiendo: boolean): number {
  if (imprimiendo) return alta ? 270 : 235;
  return alta ? 400 : 280;
}
