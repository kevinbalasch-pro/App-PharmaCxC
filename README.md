# Dashboard automático de Cuentas por Cobrar

Lee un reporte de CxC en Excel y genera un dashboard interactivo. El archivo se procesa
**íntegramente en el navegador**: no se sube a ningún servidor.

## Uso

```bash
npm install
npm run dev
```

Abre `http://localhost:5180` y arrastra el `.xls`. Otros comandos:

Con el dashboard en pantalla, **Descargar Excel** genera un `.xlsx` con seis hojas —Resumen,
Antigüedad, Por cliente, Por vendedor, Por mes y Detalle— respetando los filtros activos.
Los montos salen como números con formato contable, no como texto.

```bash
npm run verify
```

Corre el motor de ingesta contra el archivo real, comprueba que cuadra con la fila «Totales»
del propio reporte, y valida el catálogo de vendedores y el libro exportado. Acepta una ruta
como argumento.

```bash
npm run build
```

Genera `dist/` como sitio estático (se puede abrir desde una carpeta compartida, sin servidor).

## Arquitectura

```
src/
  lib/
    ingest/          Motor de lectura. No conoce React ni el dominio CxC.
      cells.ts       Tipos de celda, parseo de fechas y montos con formato local.
      rows.ts        Clasifica cada fila por su FORMA: detalle / grupo / total / ruido.
      profile.ts     Deduce el rol de cada columna perfilando sus valores.
      index.ts       Orquesta, arma los documentos y reconcilia contra los totales.
    metrics.ts       KPIs, antigüedad, agregados. Puro, sin dependencias de UI.
    vendedores.ts    Catálogo código -> nombre y su detección automática.
    export.ts        Construcción del libro .xlsx descargable.
    types.ts         Modelo canónico (ARDoc) y catálogo de roles.
    format.ts        Formato es-VE de moneda, fecha y porcentaje.
  components/        Presentación. Cada pieza recibe datos ya calculados.
scripts/             Arnés de pruebas, fuera del navegador.
```

### Vendedores

Los reportes traen códigos (`004`, `KB`); el dashboard muestra nombres. El catálogo se
resuelve en dos niveles:

1. **Desde el propio Excel.** Si el libro trae una hoja auxiliar con una tabla «código →
   nombre» (en el archivo de ejemplo es `Hoja1`), la app la detecta y la usa. Así el catálogo
   se mantiene desde Excel, sin tocar código. La detección exige que la hoja sea pequeña y que
   la mayoría de sus filas sean pares válidos, para no confundir una hoja de detalle con
   columnas «código de cliente / nombre».
2. **Desde `src/lib/vendedores.ts`**, como respaldo cuando el archivo no trae la tabla.

Si dos códigos apuntan a la misma persona (7 y 8 son Ada), sus carteras se suman en una sola
fila y ambos códigos quedan visibles en el tooltip y en el Excel exportado. Un código sin
nombre se muestra tal cual y el dashboard avisa.

Las tres capas están separadas a propósito: `ingest` no sabe de cuentas por cobrar,
`metrics` no sabe de Excel, y `components` no sabe de ninguno de los dos. Para soportar otro
tipo de reporte (inventario, ventas) se agrega un modelo y sus métricas sin tocar el motor.

### Cómo se limpia la data sola

El motor no confía en los encabezados. Trabaja en cuatro pasadas:

1. **Clasificación de filas por forma.** Las filas de detalle comparten una densidad de campos
   dominante; los encabezados de cliente de un reporte agrupado son mucho más dispersos, y las
   filas de totales se detectan por texto. Esto funciona sin leer un solo título.
2. **Perfilado de columnas sobre las filas de detalle únicamente.** Es la clave: en un reporte
   agrupado una misma columna mezcla tipos de documento (filas de detalle) con códigos de
   cliente (filas de grupo). Al perfilar solo el detalle, cada columna queda homogénea.
3. **Asignación de roles.** Combina la forma de los valores (65%) con el texto del encabezado
   (35%). Los valores pesan más porque en exportaciones de ERP los títulos suelen venir
   corridos — en el archivo de ejemplo lo están, una columna a la derecha.
4. **Reconciliación.** Suma lo leído y lo compara contra la fila «Totales» del propio reporte.
   Si no cuadra, el dashboard lo dice en rojo en vez de mostrar un número plausible y falso.

El panel «Cómo se leyó el archivo» expone todo esto: hoja elegida, mapeo columna por columna
con su evidencia, filas descartadas con el motivo, y el resultado de la reconciliación.

## Estado de la verificación

Sobre `CxC 30 Julio.xls`, las dos hojas producen el mismo resultado:

| | Original (cruda) | Data ordenada (manual) |
|---|---|---|
| Documentos | 154 | 154 |
| Saldo pendiente | 81.220 | 81.220 |
| Clientes | 85 | 85 |
| Monto original (neto) | 106.361 | no disponible |
| Ya abonado | 25.141 | no disponible |
| Reconcilia con «Totales» | sí | sí |

La hoja cruda entrega **más** información: la organización manual pierde las columnas Neto,
Moneda y Tasa, y con ellas los 25.141 USD ya abonados.

## Filtros

La barra está agrupada en tres bloques:

- **Cliente** — un selector de casillas al estilo de Excel (con su propio buscador interno y
  el saldo de cada uno a la derecha) más un campo de texto libre sobre nombre y código.
  Sin nada marcado equivale a «todos».
- **Documento** — búsqueda por número, tolerante a los ceros a la izquierda (`4188` encuentra
  `0000004188`), y filtro por tipo.
- **Producto** — selector de casillas con los artículos del archivo de productos y en cuántos
  documentos aparece cada uno. Solo se muestra si ese archivo está cargado.
- **Otros** — vendedor, rango de fechas de emisión y tramos de antigüedad.

El filtro de producto actúa sobre el **documento**: quedan las facturas que contienen alguno
de los artículos marcados y, en consecuencia, solo los clientes que los compraron. Marcar
varios artículos suma conjuntos (facturas con A **o** B), no los cruza.

Los tramos de antigüedad son `0–30`, `31–60`, `61–90` y `> 90` días. Los documentos aún no
vencidos caen en el primero: en esta operación todo se factura a contado, así que un tramo
«por vencer» aparte no aportaba información.

## Productos por factura (archivo complementario)

El botón **Cargar productos** acepta un segundo Excel que indique qué productos lleva cada
factura; su contenido llena la columna «Productos». Sin ese archivo la columna queda vacía y
todo lo demás funciona igual.

El esquema se deduce solo, apoyado en una señal muy fuerte: **se prueba cada columna contra
los folios del reporte ya cargado y gana la que más coincidencias produce**. O los números
casan o no casan, así que no hace falta acertar el título de la columna.

El archivo de ejemplo (`Ventas_PorArticulo`) viene agrupado **por producto**, al revés que el
de cuentas por cobrar: el código de artículo y el folio de factura comparten la columna A.
El motor lo resuelve igual que el otro reporte — clasifica las filas por su forma, perfila
solo las de detalle y arrastra el nombre del producto desde los encabezados de grupo.

Otras consecuencias del enfoque:

- Da igual que el folio venga como texto (`0000004188`) o como número (`4188`).
- Funciona con una fila por producto, con el folio escrito una sola vez y los productos
  debajo, o con el archivo ya aplanado a mano (la hoja «Ajustado» da idéntico resultado).
- Las filas cuyo número no es un documento del reporte se descartan por construcción: eso
  elimina encabezados, totales y facturas de otros períodos sin listas de palabras.
- La cantidad se distingue del número de renglón comprobando si los valores de cada documento
  forman la secuencia 1..n; un renglón sí, una cantidad casi nunca.
- Si ninguna columna casa, no se inventa nada: el dashboard lo dice y la columna queda vacía.

La celda tiene dos formas según la vista:

- **Por documento** — compacta: hasta cuatro productos en línea y el resto resumido («+3 más»).
- **Por cliente, desplegado** — la lista completa, un producto por línea. Cada nombre se
  recorta a lo ancho con puntos suspensivos en vez de envolver, para que una factura de 25
  artículos no dispare la altura de la fila.

En ambos casos la lista íntegra está en el tooltip y en el Excel exportado.

**Comprobación cruzada.** `verify-productos` valida el emparejamiento contra el dato duro: el
monto en bolívares de los productos de cada factura, dividido por la tasa del documento, debe
reproducir su neto en dólares del reporte de CxC. Los 141 documentos emparejados cuadran.

## Vistas de la tabla

Un selector en la cabecera de la tabla cambia la agrupación sin tocar los filtros:

- **Por documento** — una fila por documento, paginada y ordenable.
- **Por cliente** — una fila por cliente con sus totales (documentos, monto original, abonado,
  saldo, atraso máximo y participación). Al hacer clic en una fila se despliegan sus
  documentos, y **Desplegar todo** abre los de todos los clientes a la vez. Cierra con una
  fila de totales que debe cuadrar con el KPI de cartera.

  Al desplegar un cliente, su fila deja de mostrar los totales: ya aparecen al pie de su
  propio detalle, junto a las cifras que suman. Los importes del total general van pegados al
  borde derecho, igual que en esos pies, y sin porcentaje: en el total siempre valdría 100%.

No es un filtro: es la misma selección presentada de otra forma, así que vendedor, fechas,
antigüedad y todo lo demás se siguen aplicando igual en las dos vistas.

## PDF

**Descargar PDF** abre el diálogo de impresión del navegador; ahí se elige «Guardar como PDF».
Se hace así a propósito, sin librería de PDF: el texto y las gráficas salen vectoriales y
nítidos a cualquier zoom, y evita sumar medio megabyte al bundle para rasterizar la pantalla.

La hoja impresa lleva una portada con archivo de origen, hoja, fecha de corte, agrupación,
filtros aplicados y alcance, para que meses después se sepa de dónde salió cada número. Los
controles (filtros, botones, panel de diagnóstico) se ocultan, las gráficas pasan a una por
fila y las tablas se compactan; el encabezado de la tabla se repite en cada página.

Las gráficas se apilan como bloques —no como grid, que el navegador pagina mandando cada fila
a su propia hoja— y se dibujan más bajas al imprimir, de modo que **dos cualesquiera entran en
la misma A4** junto a la portada y los indicadores. La altura no se puede bajar con CSS:
Recharts mide el SVG al renderizar y no vuelve a medirlo con la media query, así que se pasa
como prop y se aplica en el evento `beforeprint` con `flushSync` (ver `lib/modoImpresion.ts`).
En «Mayores deudores» el nombre se recorta más al imprimir para que las doce etiquetas quepan
en una línea; si envuelven, ocupan el doble y chocan entre sí.

En la vista por cliente, cada cliente y sus documentos van en su propio `tbody`, que el
navegador trata como un bloque indivisible al paginar: nunca queda un nombre suelto al pie de
una hoja con sus facturas en la siguiente. Si un grupo llegara a ser más alto que una página,
`break-after` en la fila del nombre evita al menos que se separe del inicio de su detalle.

En la vista por cliente, cada cliente y sus documentos van en su propio , que el
navegador trata como un bloque indivisible al paginar: nunca queda un nombre suelto al pie de
una hoja con sus facturas en la siguiente. Si un grupo llegara a ser más alto que una página,
 en la fila del nombre evita al menos que se separe del comienzo del detalle.

Los nombres de cliente **no se recortan nunca en el HTML**: en pantalla los acorta el CSS con
puntos suspensivos, y al imprimir la columna se ensancha al 27% y el texto envuelve por
palabras (nunca a mitad de una), así que el nombre completo siempre queda legible en el PDF.

## Mostrar y ocultar gráficas

Una barra sobre las gráficas trae un interruptor por cada una. Lo que se oculta no se
renderiza, así que tampoco aparece al guardar el PDF — sirve para armar informes a medida.

## Límites conocidos

- Un solo tipo de reporte por ahora (antigüedad de saldos). Otros layouts necesitan su propio
  modelo de métricas.
- Multi-moneda: se lee la columna Moneda pero no se convierte; el ejemplo es todo USD.
- Interfaz solo en modo claro.
- El bundle pesa ~950 kB (297 kB gzip), dominado por SheetJS y Recharts. Si molesta, se puede
  cargar el parser bajo demanda con `import()`.
