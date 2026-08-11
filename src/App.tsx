import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { FileDrop } from './components/FileDrop';
import { KpiRow } from './components/Kpis';
import { EMPTY_FILTERS, Filters, type FilterState } from './components/Filters';
import { AgingChart, MesChart, TopClientesChart, VendedorChart } from './components/Charts';
import { ChartToggles, TODOS_VISIBLES, type GraficoId } from './components/ChartToggles';
import { TableSection, type Vista } from './components/TableSection';
import { PrintHeader } from './components/PrintHeader';
import { DiagnosticsPanel } from './components/Diagnostics';
import { ingestArrayBuffer } from './lib/ingest';
import {
  agingSeries,
  computeKpis,
  enrich,
  inferAsOf,
  porCliente,
  porMesEmision,
  porVendedor,
} from './lib/metrics';
import { ProductosLoader, ProductosResumen } from './components/ProductosLoader';
import { ingestProductos, type CatalogoProductos } from './lib/ingest/productos';
import { descargarExcel } from './lib/export';
import { codigosDesconocidos } from './lib/vendedores';
import { fecha, money } from './lib/format';
import type { Dataset } from './lib/types';

interface Loaded {
  buffer: ArrayBuffer;
  fileName: string;
  data: Dataset;
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const data = ingestArrayBuffer(buffer, file.name);
      if (data.docs.length === 0) {
        setError('No se encontraron filas de documentos en el archivo. Revisa que la hoja tenga el detalle por documento.');
        setLoaded(null);
      } else {
        setLoaded({ buffer, fileName: file.name, data });
        setFilters(EMPTY_FILTERS);
      }
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}`);
      setLoaded(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const changeSheet = useCallback(
    (sheetName: string) => {
      if (!loaded) return;
      const data = ingestArrayBuffer(loaded.buffer, loaded.fileName, { sheetName });
      setLoaded({ ...loaded, data });
      setFilters(EMPTY_FILTERS);
    },
    [loaded],
  );

  if (!loaded) return <FileDrop onFile={handleFile} error={error} busy={busy} />;

  return <Dashboard loaded={loaded} filters={filters} setFilters={setFilters} onSheetChange={changeSheet} onReset={() => setLoaded(null)} />;
}

function Dashboard({
  loaded,
  filters,
  setFilters,
  onSheetChange,
  onReset,
}: {
  loaded: Loaded;
  filters: FilterState;
  setFilters: Dispatch<SetStateAction<FilterState>>;
  onSheetChange: (s: string) => void;
  onReset: () => void;
}) {
  const { docs, diag, catalogoVendedores } = loaded.data;
  const [vista, setVista] = useState<Vista>('documento');
  const [graficos, setGraficos] = useState<GraficoId[]>(TODOS_VISIBLES);
  const [productos, setProductos] = useState<CatalogoProductos | null>(null);
  const [errorProductos, setErrorProductos] = useState<string | null>(null);

  const asOf = useMemo(() => inferAsOf(docs), [docs]);
  const all = useMemo(
    () => enrich(docs, asOf, catalogoVendedores, productos?.porDocumento ?? null),
    [docs, asOf, catalogoVendedores, productos],
  );

  const cargarProductos = useCallback(
    async (file: File) => {
      setErrorProductos(null);
      try {
        const buf = await file.arrayBuffer();
        setProductos(ingestProductos(buf, file.name, docs.map((d) => d.numero)));
        // Los artículos marcados son de otro archivo: dejarlos ocultaría todo.
        setFilters((f) => ({ ...f, productos: [] }));
      } catch (e) {
        setErrorProductos(`No se pudo leer el archivo de productos: ${e instanceof Error ? e.message : String(e)}`);
        setProductos(null);
      }
    },
    [docs],
  );

  const filtered = useMemo(() => {
    const q = filters.busqueda.trim().toLowerCase();
    const desde = filters.desde ? new Date(`${filters.desde}T00:00:00Z`) : null;
    const hasta = filters.hasta ? new Date(`${filters.hasta}T23:59:59Z`) : null;
    const doc = filters.documento.trim().toLowerCase();
    // Un número tecleado sin ceros a la izquierda debe encontrar "0000004188".
    const docNum = doc.replace(/^0+/, '');
    return all.filter((d) => {
      if (q && !`${d.clienteNombre} ${d.clienteCodigo}`.toLowerCase().includes(q)) return false;
      if (filters.clientes.length && !filters.clientes.includes(d.clienteNombre)) return false;
      if (doc) {
        const n = d.numero.toLowerCase();
        if (!n.includes(doc) && !(docNum && n.replace(/^0+/, '').includes(docNum))) return false;
      }
      // Se filtra el documento que contiene el producto. Como consecuencia solo
      // quedan a la vista los clientes que lo compraron, que es el objetivo.
      if (filters.productos.length && !d.productosBase.some((p) => filters.productos.includes(p))) return false;
      if (filters.vendedor && d.vendedorNombre !== filters.vendedor) return false;
      if (filters.tipoDoc && d.tipoDoc !== filters.tipoDoc) return false;
      if (filters.buckets.length && !filters.buckets.includes(d.bucket)) return false;
      if (desde && (!d.emision || d.emision < desde)) return false;
      if (hasta && (!d.emision || d.emision > hasta)) return false;
      return true;
    });
  }, [all, filters]);

  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const aging = useMemo(() => agingSeries(filtered), [filtered]);
  const clientes = useMemo(() => porCliente(filtered), [filtered]);
  const vendedores = useMemo(() => porVendedor(filtered), [filtered]);
  const meses = useMemo(() => porMesEmision(filtered), [filtered]);

  const listaVendedores = useMemo(
    () => [...new Set(all.map((d) => d.vendedorNombre))].sort((a, b) => a.localeCompare(b, 'es')),
    [all],
  );
  const listaTipos = useMemo(() => [...new Set(all.map((d) => d.tipoDoc))].sort(), [all]);

  // La lista de clientes sale del total, no de lo filtrado: si se encogiera al
  // marcar uno, no se podría añadir un segundo.
  const opcionesCliente = useMemo(() => {
    const saldos = new Map<string, number>();
    for (const d of all) saldos.set(d.clienteNombre, (saldos.get(d.clienteNombre) ?? 0) + d.saldo);
    return [...saldos.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([valor, saldo]) => ({ valor, detalle: money(saldo) }));
  }, [all]);

  // Cada artículo con en cuántos documentos aparece, para elegir con criterio.
  const opcionesProducto = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const d of all) for (const p of d.productosBase) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    return [...cuenta.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([valor, n]) => ({ valor, detalle: `${n} doc.` }));
  }, [all]);

  const desconocidos = useMemo(
    () => codigosDesconocidos(all.map((d) => d.vendedor), catalogoVendedores),
    [all, catalogoVendedores],
  );

  // Se describe lo filtrado para que el Excel exportado diga a qué corresponde.
  const descripcionFiltros = useMemo(() => {
    const p: string[] = [];
    if (filters.busqueda.trim()) p.push(`cliente contiene "${filters.busqueda.trim()}"`);
    if (filters.clientes.length)
      p.push(
        filters.clientes.length <= 4
          ? `clientes: ${filters.clientes.join(', ')}`
          : `${filters.clientes.length} clientes seleccionados`,
      );
    if (filters.documento.trim()) p.push(`documento contiene "${filters.documento.trim()}"`);
    if (filters.productos.length)
      p.push(
        filters.productos.length <= 2
          ? `producto: ${filters.productos.join(', ')}`
          : `${filters.productos.length} productos seleccionados`,
      );
    if (filters.vendedor) p.push(`vendedor ${filters.vendedor}`);
    if (filters.tipoDoc) p.push(`tipo ${filters.tipoDoc}`);
    if (filters.buckets.length) p.push(`antigüedad ${filters.buckets.join(', ')} días`);
    if (filters.desde) p.push(`emitidos desde ${filters.desde}`);
    if (filters.hasta) p.push(`emitidos hasta ${filters.hasta}`);
    return p.length ? p.join(' · ') : null;
  }, [filters]);

  const exportar = useCallback(() => {
    descargarExcel({
      kpis,
      aging,
      clientes,
      vendedores,
      meses,
      docs: filtered,
      diag,
      asOf,
      filtros: descripcionFiltros,
    });
  }, [kpis, aging, clientes, vendedores, meses, filtered, diag, asOf, descripcionFiltros]);

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>Cuentas por Cobrar</h1>
          <div className="sub">
            {diag.fileName} · hoja <strong>{diag.sheetName}</strong> · corte al <strong>{fecha(asOf)}</strong>
          </div>
        </div>
        <div className="topbar-acciones">
          <button className="btn btn-primary" onClick={exportar}>
            Descargar Excel
          </button>
          <button className="btn" onClick={() => window.print()}>
            Descargar PDF
          </button>
          <ProductosLoader
            catalogo={productos}
            onFile={cargarProductos}
            onClear={() => {
              setProductos(null);
              setErrorProductos(null);
              setFilters((f) => ({ ...f, productos: [] }));
            }}
            error={errorProductos}
          />
          <button className="btn" onClick={onReset}>
            Cargar otro archivo
          </button>
        </div>
      </header>

      <ProductosResumen catalogo={productos} />

      <PrintHeader
        diag={diag}
        asOf={asOf}
        filtros={descripcionFiltros}
        vista={vista === 'documento' ? 'Por documento' : 'Por cliente'}
        documentos={filtered.length}
        total={all.length}
      />

      {desconocidos.length > 0 && (
        <div className="alert warn" style={{ marginTop: 12 }}>
          <span aria-hidden>⚠</span>
          <span>
            Códigos de vendedor sin nombre en el catálogo: {desconocidos.join(', ')}. Se muestran con su código.
            Agrégalos a la hoja de vendedores del Excel o a{' '}
            <code className="mono">src/lib/vendedores.ts</code>.
          </span>
        </div>
      )}

      <KpiRow k={kpis} />

      <Filters
        value={filters}
        onChange={setFilters}
        opcionesCliente={opcionesCliente}
        opcionesProducto={opcionesProducto}
        vendedores={listaVendedores}
        tipos={listaTipos}
        activos={filtered.length}
        total={all.length}
      />

      <ChartToggles visibles={graficos} onChange={setGraficos} />

      {graficos.length > 0 && (
        <div className="chart-grid">
          {graficos.includes('antiguedad') && <AgingChart data={aging} />}
          {graficos.includes('meses') && <MesChart data={meses} />}
          {graficos.includes('clientes') && <TopClientesChart data={clientes} />}
          {graficos.includes('vendedores') && <VendedorChart data={vendedores} />}
        </div>
      )}

      <TableSection docs={filtered} vista={vista} onVista={setVista} />

      <DiagnosticsPanel diag={diag} onSheetChange={onSheetChange} />

      <p className="foot">
        Procesado localmente en el navegador · {all.length} documentos leídos de {diag.rowCounts.total} filas
      </p>
    </div>
  );
}
