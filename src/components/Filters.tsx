import { MultiSelect, type Opcion } from './MultiSelect';
import { BUCKETS, type Bucket } from '../lib/metrics';

export interface FilterState {
  /** Texto libre sobre nombre y código de cliente. */
  busqueda: string;
  /** Clientes marcados en el filtro de casillas. Vacío = todos. */
  clientes: string[];
  /** Texto libre sobre el número de documento. */
  documento: string;
  /** Productos marcados. Vacío = todos. Requiere el archivo de productos. */
  productos: string[];
  vendedor: string;
  tipoDoc: string;
  buckets: Bucket[];
  desde: string;
  hasta: string;
}

export const EMPTY_FILTERS: FilterState = {
  busqueda: '',
  clientes: [],
  documento: '',
  productos: [],
  vendedor: '',
  tipoDoc: '',
  buckets: [],
  desde: '',
  hasta: '',
};

interface Props {
  value: FilterState;
  onChange: (f: FilterState) => void;
  opcionesCliente: Opcion[];
  /** Vacío cuando no se ha cargado el archivo de productos: el grupo no se muestra. */
  opcionesProducto: Opcion[];
  vendedores: string[];
  tipos: string[];
  activos: number;
  total: number;
}

export function Filters({
  value,
  onChange,
  opcionesCliente,
  opcionesProducto,
  vendedores,
  tipos,
  activos,
  total,
}: Props) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...value, [k]: v });

  const toggleBucket = (b: Bucket) =>
    set('buckets', value.buckets.includes(b) ? value.buckets.filter((x) => x !== b) : [...value.buckets, b]);

  const dirty = JSON.stringify(value) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <>
      <div className="card filters">
        <div className="filtros-grupo">
          <span className="filtros-titulo">Cliente</span>
          <div className="filtros-fila">
            <MultiSelect
              etiqueta="Seleccionar clientes"
              opciones={opcionesCliente}
              seleccion={value.clientes}
              onChange={(s) => set('clientes', s)}
              vacio="Todos los clientes"
              buscarPlaceholder="Filtrar la lista…"
            />
            <div className="field">
              <label htmlFor="f-busq">Buscar por nombre o código</label>
              <input
                id="f-busq"
                type="search"
                placeholder="Ej. Villalobos"
                value={value.busqueda}
                onChange={(e) => set('busqueda', e.target.value)}
                style={{ minWidth: 210 }}
              />
            </div>
          </div>
        </div>

        <div className="filtros-grupo">
          <span className="filtros-titulo">Documento</span>
          <div className="filtros-fila">
            <div className="field">
              <label htmlFor="f-doc">Buscar por número</label>
              <input
                id="f-doc"
                type="search"
                inputMode="numeric"
                placeholder="Ej. 4188"
                value={value.documento}
                onChange={(e) => set('documento', e.target.value)}
                style={{ minWidth: 160 }}
              />
            </div>
            <div className="field">
              <label htmlFor="f-tipo">Tipo</label>
              <select id="f-tipo" value={value.tipoDoc} onChange={(e) => set('tipoDoc', e.target.value)}>
                <option value="">Todos</option>
                {tipos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {opcionesProducto.length > 0 && (
          <div className="filtros-grupo">
            <span className="filtros-titulo">Producto</span>
            <div className="filtros-fila">
              <MultiSelect
                etiqueta="Contiene alguno de"
                opciones={opcionesProducto}
                seleccion={value.productos}
                onChange={(s) => set('productos', s)}
                vacio="Todos los productos"
                buscarPlaceholder="Filtrar artículos…"
              />
            </div>
          </div>
        )}

        <div className="filtros-grupo">
          <span className="filtros-titulo">Otros</span>
          <div className="filtros-fila">
            <div className="field">
              <label htmlFor="f-vend">Vendedor</label>
              <select id="f-vend" value={value.vendedor} onChange={(e) => set('vendedor', e.target.value)}>
                <option value="">Todos</option>
                {vendedores.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-desde">Emisión desde</label>
              <input id="f-desde" type="date" value={value.desde} onChange={(e) => set('desde', e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="f-hasta">Hasta</label>
              <input id="f-hasta" type="date" value={value.hasta} onChange={(e) => set('hasta', e.target.value)} />
            </div>

            <div className="field">
              <label>Antigüedad (días de atraso)</label>
              <div className="chip-row">
                {BUCKETS.map((b) => (
                  <button
                    key={b}
                    className="chip"
                    aria-pressed={value.buckets.includes(b)}
                    onClick={() => toggleBucket(b)}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="filtros-resultado">
          <span>
            {activos === total ? (
              <>
                <strong>{total}</strong> documentos
              </>
            ) : (
              <>
                <strong>{activos}</strong> de {total} documentos
              </>
            )}
          </span>
          {dirty && (
            <button className="btn btn-ghost" onClick={() => onChange(EMPTY_FILTERS)}>
              Limpiar todo
            </button>
          )}
        </div>
      </div>
    </>
  );
}
