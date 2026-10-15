'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import maplibregl, {type Map as MapLibreMap} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import ParquetWorker from '@/app/utils/ParquetWorker';
import DotDensityWorker from '@/app/utils/DotDensityWorker';
import {TILESET_URL} from '@/app/utils/api/constants';
import type {ColumnarTableData} from '@/app/utils/ParquetWorker/parquetWorker.types';
import type {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {MINIMAL_BASEMAP_STYLE_URL} from '@constants/map/viewDefaults';
import {DOT_DENSITY_BASE_CATEGORIES} from '@constants/demography/dotDensity';
import {
  dataZoomForMapZoom,
  latToMercY,
  lngToMercX,
  tileKey,
  type TileID,
} from '@/app/utils/dotDensity/tileMath';
import {LabLayer, LAB_LAYER_ID} from './labEngine';
import {LAB_MODES, type LabMode} from './labModes';

type Preset = {
  id: string;
  label: string;
  st: string;
  center: [number, number];
  zoom: number;
  parent?: 'vtd' | 'bg';
  /** Small enough to load every block's demography in the browser. */
  small?: boolean;
};

const PRESETS: Preset[] = [
  {id: 'chicago', label: 'Chicago, IL', st: 'il', center: [-87.68, 41.84], zoom: 10.4},
  {id: 'atlanta', label: 'Atlanta, GA', st: 'ga', center: [-84.4, 33.76], zoom: 9.8},
  {id: 'houston', label: 'Houston, TX', st: 'tx', center: [-95.4, 29.76], zoom: 9.6},
  {id: 'nyc', label: 'New York City, NY', st: 'ny', center: [-73.94, 40.7], zoom: 10.3},
  {id: 'la', label: 'Los Angeles, CA', st: 'ca', center: [-118.25, 34.03], zoom: 9.7, parent: 'bg'},
  {id: 'detroit', label: 'Detroit, MI', st: 'mi', center: [-83.1, 42.37], zoom: 10.2},
  {id: 'denver', label: 'Denver, CO', st: 'co', center: [-104.95, 39.72], zoom: 10.2},
  {id: 'dc', label: 'Washington, DC', st: 'dc', center: [-77.02, 38.9], zoom: 11.6, small: true},
  {id: 'ri', label: 'Providence, RI', st: 'ri', center: [-71.42, 41.82], zoom: 11, small: true},
  {id: 'colorado', label: 'Colorado statewide', st: 'co', center: [-105.5, 39], zoom: 6.6},
];

type Category = {label: string; hex: string; columns: string[]};
const CATEGORY_SETS: Record<string, {label: string; cats: Category[]}> = {
  race: {
    label: 'Race/ethnicity',
    cats: DOT_DENSITY_BASE_CATEGORIES.map(c => ({
      label: c.label,
      hex: c.hex,
      columns: [c.columns.TOTPOP],
    })),
  },
  vap: {
    label: 'Race/ethnicity (VAP)',
    cats: DOT_DENSITY_BASE_CATEGORIES.map(c => ({
      label: c.label,
      hex: c.hex,
      columns: [c.columns.VAP],
    })),
  },
  pres20: {
    label: '2020 President',
    cats: [
      {label: 'Biden', hex: '#2b6cb0', columns: ['pres_20_dem']},
      {label: 'Trump', hex: '#d64545', columns: ['pres_20_rep']},
    ],
  },
};

type Theme = 'light' | 'dark' | 'none' | 'blank';
const THEMED_PROPS: Record<string, string[]> = {
  background: ['background-color'],
  fill: ['fill-color'],
  line: ['line-color'],
  symbol: ['text-color', 'text-halo-color'],
};

/** Recolor the minimal basemap in place; originals are snapshotted on first use. */
const applyTheme = (map: MapLibreMap, theme: Theme, originals: Map<string, unknown>) => {
  for (const layer of map.getStyle().layers) {
    if (layer.id.startsWith('lab-') || layer.id === LAB_LAYER_ID) continue;
    const props = THEMED_PROPS[layer.type] ?? [];
    for (const prop of props) {
      const key = `${layer.id}|${prop}`;
      const value = map.getPaintProperty(layer.id, prop);
      if (value !== undefined && !originals.has(key)) originals.set(key, value);
    }
    const set = (prop: string, value: unknown) => {
      if (originals.has(`${layer.id}|${prop}`)) map.setPaintProperty(layer.id, prop, value);
    };
    const restore = (prop: string) => set(prop, originals.get(`${layer.id}|${prop}`));
    const visible =
      layer.type === 'background' ||
      theme === 'light' ||
      theme === 'dark' ||
      (theme === 'none' && layer.type === 'symbol');
    map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
    if (theme === 'light') {
      props.forEach(restore);
    } else if (theme === 'none' || theme === 'blank') {
      props.forEach(restore);
      set('background-color', '#f9f7f3');
    } else {
      const water = layer.id === 'water';
      set('background-color', '#0b0d12');
      set('fill-color', water ? '#151b26' : layer.id === 'earth' ? '#0d1016' : '#11151b');
      set('line-color', layer.id.startsWith('roads') ? '#1d222a' : '#2b3038');
      set('text-color', '#8a929c');
      set('text-halo-color', '#0b0d12');
    }
  }
};

const MASK_LAYERS = ['lab-mask-roads', 'lab-mask-buildings'];
const setMaskLayers = (map: MapLibreMap, on: boolean) => {
  if (!on) {
    MASK_LAYERS.forEach(id => map.getLayer(id) && map.removeLayer(id));
    return;
  }
  if (map.getLayer(MASK_LAYERS[0])) return;
  map.addLayer(
    {
      id: MASK_LAYERS[0],
      type: 'line',
      source: 'protomaps',
      'source-layer': 'roads',
      filter: ['in', 'pmap:kind', 'minor_road', 'medium_road'],
      paint: {
        'line-color': '#ff00ff',
        'line-width': [
          'interpolate',
          ['exponential', 1.6],
          ['zoom'],
          9,
          0.7,
          12,
          1.4,
          15,
          4,
          18,
          14,
        ],
      },
    },
    LAB_LAYER_ID
  );
  map.addLayer(
    {
      id: MASK_LAYERS[1],
      type: 'fill',
      source: 'protomaps',
      'source-layer': 'buildings',
      paint: {'fill-color': '#ff00ff'},
    },
    LAB_LAYER_ID
  );
};

const defaultParams = () =>
  Object.fromEntries(
    LAB_MODES.map(m => [m.id, Object.fromEntries(m.params.map(p => [p.key, p.value]))])
  );

/** Tiles covering the viewport plus the field margin and a one-tile ring. */
const coverTiles = (map: MapLibreMap, marginPx: number): TileID[] => {
  const zoom = map.getZoom();
  const z = dataZoomForMapZoom(zoom);
  const canvas = map.getCanvas();
  const worldPx = 512 * 2 ** zoom;
  const c = map.getCenter();
  const cx = lngToMercX(c.lng);
  const cy = latToMercY(c.lat);
  const hw = (canvas.clientWidth / 2 + marginPx) / worldPx;
  const hh = (canvas.clientHeight / 2 + marginPx) / worldPx;
  const dim = 2 ** z;
  const clamp = (v: number) => Math.min(dim - 1, Math.max(0, v));
  const x0 = clamp(Math.floor((cx - hw) * dim) - 1);
  const x1 = clamp(Math.floor((cx + hw) * dim) + 1);
  const y0 = clamp(Math.floor((cy - hh) * dim) - 1);
  const y1 = clamp(Math.floor((cy + hh) * dim) + 1);
  const tiles: TileID[] = [];
  // ponytail: capped; a 4K viewport at a tile boundary can exceed this
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1 && tiles.length < 160; y++) tiles.push({z, x, y});
  return tiles;
};

export const DotLab: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const layerRef = useRef<LabLayer | null>(null);
  const rowIndexRef = useRef<Map<string, Float64Array> | null>(null);
  const columnsRef = useRef<ColumnarTableData | null>(null);
  const datasetRef = useRef({epoch: 0, sourceLayer: '', inflight: new Set<string>()});
  const coverRef = useRef<() => void>(() => {});
  const rebuildRef = useRef<() => void>(() => {});
  const themeOriginals = useRef(new Map<string, unknown>());

  const [ready, setReady] = useState(false);
  const [presetId, setPresetId] = useState('chicago');
  const [geo, setGeo] = useState<'parent' | 'child'>('parent');
  const [catSet, setCatSet] = useState('race');
  const [disabled, setDisabled] = useState<string[]>([]);
  const [modeId, setModeId] = useState('pointillism');
  const [paramsByMode, setParamsByMode] = useState(defaultParams);
  const [theme, setTheme] = useState<Theme>('light');
  const [densityFactor, setDensityFactor] = useState(1);
  const [fieldDs, setFieldDs] = useState(2);
  const [status, setStatus] = useState('');
  const [columnsVersion, setColumnsVersion] = useState(0);
  const [frameInfo, setFrameInfo] = useState<{ppd: number; mPerPx: number; error?: string}>({
    ppd: 1,
    mPerPx: 1,
  });

  const preset = PRESETS.find(p => p.id === presetId)!;
  const mode = LAB_MODES.find(m => m.id === modeId)!;
  const params = paramsByMode[modeId];
  const cats = CATEGORY_SETS[catSet].cats;

  // ---- map + layer, once
  useEffect(() => {
    if (!containerRef.current) return;
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    const p = PRESETS[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MINIMAL_BASEMAP_STYLE_URL,
      center: p.center,
      zoom: p.zoom,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    map.touchZoomRotate.disableRotation();
    const layer = new LabLayer();
    let last: {ppd: number; mPerPx: number; error?: string} = {ppd: 0, mPerPx: 0};
    layer.onFrame = info => {
      if (
        info.ppd !== last.ppd ||
        info.error !== last.error ||
        Math.abs(info.mPerPx - last.mPerPx) > last.mPerPx * 0.02
      ) {
        last = {...info};
        setFrameInfo(last);
      }
    };
    mapRef.current = map;
    layerRef.current = layer;
    // console handle for poking at the lab
    (window as unknown as {dotLab: unknown}).dotLab = {map, layer};
    // style.load, not load: 'load' waits on every basemap tile and can stall
    map.once('style.load', () => {
      const firstSymbol = map.getStyle().layers.find(l => l.type === 'symbol')?.id;
      map.addLayer(layer, firstSymbol);
      setReady(true);
    });
    const onMove = () => coverRef.current();
    map.on('moveend', onMove);
    map.on('mousemove', e => {
      layer.mouse = [e.point.x, map.getCanvas().clientHeight - e.point.y];
      map.triggerRepaint();
    });
    map.on('mouseout', () => {
      layer.mouse = [-1e4, -1e4];
      map.triggerRepaint();
    });
    return () => {
      map.remove();
      maplibregl.removeProtocol('pmtiles');
    };
  }, []);

  // ---- tile cover + density textures (rebuilt from the cross-tile area registry)
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !map || !layer || !DotDensityWorker) return;
    let raf = 0;
    rebuildRef.current = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rows = rowIndexRef.current;
        if (!rows) return;
        // A feature's people are spread over its in-tile pieces across all
        // resident tiles; tiles cover viewport + margin + 1 ring, so only
        // features hanging off that ring are overcounted (off-screen).
        const area = new Map<string, number>();
        layer.forEachTile((_, paths, areas) =>
          paths.forEach((p, i) => area.set(p, (area.get(p) ?? 0) + areas[i]))
        );
        const n = cats.length;
        layer.forEachTile((key, paths) => {
          const tex = new Float32Array(paths.length * 8);
          paths.forEach((path, i) => {
            const counts = rows.get(path);
            const a = area.get(path);
            if (!counts || !a) return;
            for (let c = 0; c < Math.min(n, 6); c++) tex[i * 8 + c] = counts[c] / a;
            tex[i * 8 + 6] = counts[n] / a;
          });
          layer.setTileDensities(key, tex);
        });
        map.triggerRepaint();
      });
    };
    coverRef.current = () => {
      const ds = datasetRef.current;
      if (!ds.sourceLayer) return;
      const wanted = coverTiles(map, 220);
      const keys = new Set(wanted.map(tileKey));
      let changed = false;
      for (const key of layer.tileKeys()) {
        if (!keys.has(key)) {
          layer.removeTile(key);
          changed = true;
        }
      }
      for (const tile of wanted) {
        const key = tileKey(tile);
        if (layer.hasTile(key) || ds.inflight.has(key)) continue;
        const epoch = ds.epoch;
        ds.inflight.add(key);
        DotDensityWorker!
          .getTileBuffers(tile.z, tile.x, tile.y, ds.sourceLayer)
          .then(buffers => {
            if (epoch !== datasetRef.current.epoch || !buffers) return;
            // the view may have moved on while this was decoding
            if (!coverTiles(map, 220).some(t => tileKey(t) === key)) return;
            layer.setTileData(key, tile, buffers);
            rebuildRef.current();
          })
          .catch(e => console.warn('[dot-lab] tile failed', key, e))
          .finally(() => ds.inflight.delete(key));
      }
      if (changed) rebuildRef.current();
    };
    return () => cancelAnimationFrame(raf);
  }, [ready, cats]);

  // ---- dataset: demography + tileset for the preset/geography
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !map || !layer || !ParquetWorker || !DotDensityWorker) return;
    const gerrydb = `${preset.st}_districtr_view_v2`;
    const parentLayer = `${preset.st}_districtr_${preset.parent ?? 'vtd'}_view_v2`;
    const childLayer = `${preset.st}_districtr_block_view_v2`;
    const useChild = geo === 'child' && preset.small;
    const ds = datasetRef.current;
    ds.epoch++;
    ds.sourceLayer = '';
    ds.inflight.clear();
    const epoch = ds.epoch;
    layer.tileKeys().forEach(k => layer.removeTile(k));
    rowIndexRef.current = null;
    columnsRef.current = null;
    layer.resetParticles();
    map.jumpTo({center: preset.center, zoom: preset.zoom});
    DotDensityWorker.init(`${TILESET_URL}/tilesets/${gerrydb}.pmtiles`);
    setStatus(
      `Loading ${useChild ? 'block' : preset.parent === 'bg' ? 'block group' : 'precinct'} demography…`
    );
    const doc = {
      gerrydb_table: gerrydb,
      parent_layer: parentLayer,
      child_layer: childLayer,
    } as unknown as DocumentObject;
    (async () => {
      let broken: string[] = [];
      if (useChild) broken = (await ParquetWorker!.getDemography(doc, [])).results.path;
      const {results} = await ParquetWorker!.getDemography(doc, broken);
      if (epoch !== datasetRef.current.epoch) return;
      columnsRef.current = results;
      ds.sourceLayer = useChild ? childLayer : parentLayer;
      setStatus(`${results.path.length.toLocaleString()} ${useChild ? 'blocks' : 'units'} loaded`);
      setColumnsVersion(v => v + 1);
      coverRef.current();
    })().catch(e => setStatus(`Failed: ${(e as Error).message}`));
  }, [ready, presetId, geo]);

  // ---- row index from the loaded columns + category set + toggles
  useEffect(() => {
    const layer = layerRef.current;
    const cols = columnsRef.current;
    if (!layer || !cols) return;
    const off = new Set(disabled);
    const index = new Map<string, Float64Array>();
    const colData = cats.map(c =>
      c.columns.map(name => cols[name as keyof ColumnarTableData] as number[] | undefined)
    );
    cols.path.forEach((path, i) => {
      const v = new Float64Array(cats.length + 1);
      cats.forEach((cat, c) => {
        if (off.has(cat.label)) return;
        v[c] = colData[c].reduce((s, col) => s + (Number(col?.[i]) || 0), 0);
        v[cats.length] += v[c];
      });
      index.set(path, v);
    });
    rowIndexRef.current = index;
    layer.setPalette(cats.map(c => c.hex));
    layer.resetParticles();
    rebuildRef.current();
  }, [columnsVersion, cats, disabled]);

  // ---- mode, params, globals
  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!ready || !layer || !map) return;
    layer.densityFactor = densityFactor;
    layer.fieldDs = fieldDs;
    layer.setMode(mode, params);
    setMaskLayers(map, !!mode.readback);
    map.triggerRepaint();
  }, [ready, mode, params, densityFactor, fieldDs]);

  useEffect(() => {
    setTheme(mode.basemap ?? 'light');
  }, [mode]);

  useEffect(() => {
    if (ready && mapRef.current) applyTheme(mapRef.current, theme, themeOriginals.current);
  }, [ready, theme]);

  const families = useMemo(() => {
    const out = new Map<string, LabMode[]>();
    LAB_MODES.forEach(m => out.set(m.family, [...(out.get(m.family) ?? []), m]));
    return Array.from(out.entries());
  }, []);

  const setParam = (key: string, value: number) =>
    setParamsByMode(prev => ({...prev, [modeId]: {...prev[modeId], [key]: value}}));

  const quadLabels = mode.quadLabels?.(params, frameInfo.mPerPx);

  return (
    <div className="fixed inset-0 flex text-sm bg-white">
      <aside className="w-[360px] shrink-0 overflow-y-auto border-r border-gray-200 p-3 flex flex-col gap-3">
        <div>
          <h1 className="text-base font-semibold">Dot density lab</h1>
          <p className="text-xs text-gray-500">
            Prototype renderers for the demographic visualization mode. Same data path as production
            (PMTiles geometry + demography parquet), drawn by a WebGL custom layer.
          </p>
        </div>

        <section className="grid grid-cols-[90px_1fr] gap-x-2 gap-y-1.5 items-center">
          <label>Place</label>
          <select
            className="border rounded px-1 py-0.5"
            value={presetId}
            onChange={e => setPresetId(e.target.value)}
          >
            {PRESETS.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <label>Geography</label>
          <select
            className="border rounded px-1 py-0.5"
            value={geo}
            onChange={e => setGeo(e.target.value as 'parent' | 'child')}
          >
            <option value="parent">{preset.parent === 'bg' ? 'Block groups' : 'Precincts'}</option>
            <option value="child" disabled={!preset.small}>
              Blocks{preset.small ? '' : ' (small states only)'}
            </option>
          </select>
          <label>Data</label>
          <select
            className="border rounded px-1 py-0.5"
            value={catSet}
            onChange={e => {
              setCatSet(e.target.value);
              setDisabled([]);
            }}
          >
            {Object.entries(CATEGORY_SETS).map(([id, s]) => (
              <option key={id} value={id}>
                {s.label}
              </option>
            ))}
          </select>
          <label>Basemap</label>
          <select
            className="border rounded px-1 py-0.5"
            value={theme}
            onChange={e => setTheme(e.target.value as Theme)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="none">Paper (labels only)</option>
            <option value="blank">None</option>
          </select>
          <label>Dots ×{densityFactor}</label>
          <input
            type="range"
            min={-3}
            max={5}
            step={1}
            value={Math.log2(densityFactor)}
            onChange={e => setDensityFactor(2 ** Number(e.target.value))}
          />
          <label>Field res</label>
          <select
            className="border rounded px-1 py-0.5"
            value={fieldDs}
            onChange={e => setFieldDs(Number(e.target.value))}
          >
            <option value={1}>Full (CSS px)</option>
            <option value={2}>Half</option>
            <option value={4}>Quarter</option>
          </select>
        </section>

        <section className="flex flex-col gap-2">
          {families.map(([family, modes]) => (
            <div key={family}>
              <div className="text-[11px] uppercase tracking-wide text-gray-400">{family}</div>
              <div className="flex flex-col">
                {modes.map(m => (
                  <button
                    key={m.id}
                    className={`text-left rounded px-1.5 py-0.5 ${m.id === modeId ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100'}`}
                    onClick={() => setModeId(m.id)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2 border-t pt-2">
          <div className="font-medium">{mode.name}</div>
          <p className="text-xs text-gray-600 leading-snug">{mode.idea}</p>
          {mode.params.map(p => (
            <label key={p.key} className="flex flex-col gap-0.5 text-xs">
              <span className="flex justify-between">
                <span>{p.label}</span>
                <span className="tabular-nums text-gray-500">{params[p.key]}</span>
              </span>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={params[p.key]}
                onChange={e => setParam(p.key, Number(e.target.value))}
              />
            </label>
          ))}
          {!!mode.params.length && (
            <button
              className="self-start text-xs text-indigo-600 hover:underline"
              onClick={() =>
                setParamsByMode(prev => ({...prev, [modeId]: defaultParams()[modeId]}))
              }
            >
              Reset parameters
            </button>
          )}
        </section>
        <div className="mt-auto text-xs text-gray-500">
          {status}
          {frameInfo.error && <div className="text-red-600 break-words">{frameInfo.error}</div>}
        </div>
      </aside>

      <div className="relative flex-1">
        <div ref={containerRef} className="h-full w-full" />
        {quadLabels && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
            {quadLabels.map(l => (
              <div key={l} className="p-2">
                <span className="rounded bg-white/85 px-1.5 py-0.5 text-xs font-medium">{l}</span>
              </div>
            ))}
          </div>
        )}
        {/* On-map legend: group swatches double as toggles */}
        <div className="absolute bottom-8 left-2 flex max-w-[calc(100%-1rem)] flex-col gap-1 rounded bg-white/90 px-2 py-1.5 text-xs shadow">
          <div className="flex flex-wrap gap-1">
            {cats.map(c => {
              const off = disabled.includes(c.label);
              return (
                <button
                  key={c.label}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${off ? 'opacity-40' : ''}`}
                  onClick={() =>
                    setDisabled(d => (off ? d.filter(x => x !== c.label) : [...d, c.label]))
                  }
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{background: c.hex}}
                  />
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="text-gray-700">
            {mode.legend?.(params, frameInfo.ppd) ??
              (params.ref ? `Full tone ≈ ${params.ref.toLocaleString()} people/km²` : mode.name)}
          </div>
        </div>
      </div>
    </div>
  );
};
