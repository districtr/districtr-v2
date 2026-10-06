'use client';
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type PointLike,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Protocol} from 'pmtiles';
import {useEffect, useMemo, useRef, useState} from 'react';
import GlMap, {
  Layer,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import {
  Button,
  Card,
  Flex,
  Heading,
  Link,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  Text,
} from '@radix-ui/themes';
import {bbox as turfBbox, booleanPointInPolygon, polygon} from '@turf/turf';
import {MAP_OPTIONS, MINIMAL_BASEMAP_STYLE_URL} from '@constants/map/viewDefaults';
import {useMapModules} from '@/app/hooks/useMapModules';
import {getPointSelectionData} from '@/app/utils/api/apiHandlers/getPointSelectionData';
import {CMS_PUBLIC_URL, TILESET_URL} from '@/app/utils/api/constants';
import {
  getExtractToken,
  requestExtract,
  type ExtractFormat,
  type ExtractResult,
  type ExtractToken,
} from '@/app/utils/api/extract';

const SOURCE = 'extract-units';
const FILL = 'extract-fill';
const LASSO = 'extract-lasso';
const EMPTY: GeoJSON.FeatureCollection = {type: 'FeatureCollection', features: []};

type Tool = 'pan' | 'brush' | 'eraser' | 'lasso';
type Shape = GeoJSON.Feature<GeoJSON.Polygon>;

const FORMATS: {value: ExtractFormat; label: string}[] = [
  {value: 'gpkg', label: 'GeoPackage'},
  {value: 'shp', label: 'Shapefile (zip)'},
  {value: 'geojson', label: 'GeoJSON'},
  {value: 'csv', label: 'CSV (no geometry)'},
];

const SELECTED: ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false];

// Centroids come from tilesets/{layer}_points.parquet, which the editor
// already loads; cached per layer for the page's lifetime.
const pointCache = new Map<string, Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>>();
const loadPoints = (layer: string) => {
  if (!pointCache.has(layer)) {
    const points = getPointSelectionData({layer, columns: ['path', 'x', 'y'], source: SOURCE});
    pointCache.set(layer, points);
    points.catch(() => pointCache.delete(layer));
  }
  return pointCache.get(layer)!;
};

/** Units of `layer` whose centroid falls inside any of `shapes`. */
// ponytail: main-thread scan of every centroid with a bbox prefilter (fine for
// a state's blocks); move it into GeometryWorker if it janks.
const unitsInShapes = async (layer: string, shapes: Shape[]) => {
  const points = await loadPoints(layer);
  const boxes = shapes.map(shape => turfBbox(shape));
  const ids: string[] = [];
  for (const point of points.features) {
    const [x, y] = point.geometry.coordinates;
    const hit = shapes.some((shape, i) => {
      const [minx, miny, maxx, maxy] = boxes[i];
      return (
        x >= minx && x <= maxx && y >= miny && y <= maxy && booleanPointInPolygon([x, y], shape)
      );
    });
    if (hit) ids.push(point.properties!.path);
  }
  return ids;
};

export const ExtractTool = () => {
  const [access, setAccess] = useState<ExtractToken | null>(null);
  useEffect(() => {
    getExtractToken().then(setAccess);
  }, []);

  if (!access) return <Gate>Checking access…</Gate>;
  if (access.status === 'ok') return <ExtractMap />;
  return (
    <Gate>
      {access.status === 'signed-out' && (
        <>
          <Text>Sign in to the Districtr CMS to download data.</Text>
          <Link href={`${CMS_PUBLIC_URL}/admin/login/?next=/admin/`}>Sign in</Link>
        </>
      )}
      {access.status === 'forbidden' && (
        <Text>Your account doesn&apos;t have the data user role. Ask a Districtr admin.</Text>
      )}
      {access.status === 'error' && <Text color="red">{access.detail}</Text>}
    </Gate>
  );
};

const Gate: React.FC<{children: React.ReactNode}> = ({children}) => (
  <Flex className="h-screen" align="center" justify="center">
    <Card size="3">
      <Flex direction="column" gap="3" align="start">
        <Heading size="4">Download data</Heading>
        {children}
      </Flex>
    </Card>
  </Flex>
);

const ExtractMap = () => {
  const mapRef = useRef<MapRef | null>(null);
  const modules = useMapModules();
  const sortedModules = useMemo(
    () => [...modules].sort((a, b) => a.name.localeCompare(b.name)),
    [modules]
  );
  const [slug, setSlug] = useState<string>();
  const districtrMap = modules.find(m => m.districtr_map_slug === slug);
  const [useChild, setUseChild] = useState(false);
  const layer = districtrMap
    ? useChild && districtrMap.child_layer
      ? districtrMap.child_layer
      : districtrMap.parent_layer
    : undefined;

  const [tool, setTool] = useState<Tool>('lasso');
  const [brushSize, setBrushSize] = useState(15);
  const [format, setFormat] = useState<ExtractFormat>('gpkg');
  // Shapes outlive a layer swap; the selection is re-derived from them.
  const shapes = useRef<Shape[]>([]);
  const [shapesData, setShapesData] = useState<GeoJSON.FeatureCollection>(EMPTY);
  const selection = useRef(new Set<string>());
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState('');
  const drag = useRef<{mode: 'paint' | 'lasso'; ring: [number, number][]} | null>(null);

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    return () => maplibregl.removeProtocol('pmtiles');
  }, []);

  const applySelection = (onLayer: string, ids: string[], selected: boolean) => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    for (const id of ids) {
      if (selection.current.has(id) === selected) continue;
      if (selected) selection.current.add(id);
      else selection.current.delete(id);
      map.setFeatureState({source: SOURCE, sourceLayer: onLayer, id}, {selected});
    }
    setCount(selection.current.size);
    setResult(null);
  };

  const clearSelection = () => {
    const map = mapRef.current?.getMap();
    if (map?.getSource(SOURCE) && layer)
      map.removeFeatureState({source: SOURCE, sourceLayer: layer});
    selection.current = new Set();
    setCount(0);
    setResult(null);
  };

  const selectInShapes = async (onLayer: string, newShapes: Shape[]) => {
    setBusy('Selecting units…');
    setError('');
    try {
      applySelection(onLayer, await unitsInShapes(onLayer, newShapes), true);
    } catch {
      setError(`Couldn't load unit centroids for ${onLayer}`);
    } finally {
      setBusy(null);
    }
  };

  const setShapes = (next: Shape[]) => {
    shapes.current = next;
    setShapesData({type: 'FeatureCollection', features: next});
  };

  const onModuleChange = (nextSlug: string) => {
    clearSelection();
    setShapes([]);
    setUseChild(false);
    setSlug(nextSlug);
    const extent = modules.find(m => m.districtr_map_slug === nextSlug)?.extent;
    if (extent) mapRef.current?.fitBounds(extent, {padding: 20, duration: 0});
  };

  const onLayerChange = (child: boolean) => {
    if (!districtrMap) return;
    clearSelection();
    setUseChild(child);
    const nextLayer =
      child && districtrMap.child_layer ? districtrMap.child_layer : districtrMap.parent_layer;
    // Brush edits don't carry over: they are the other layer's ids.
    if (shapes.current.length) selectInShapes(nextLayer, shapes.current);
  };

  const paintAt = (point: {x: number; y: number}) => {
    const map = mapRef.current?.getMap();
    if (!map || !layer) return;
    const box: [PointLike, PointLike] = [
      [point.x - brushSize, point.y - brushSize],
      [point.x + brushSize, point.y + brushSize],
    ];
    const ids = map.queryRenderedFeatures(box, {layers: [FILL]}).map(f => String(f.id));
    applySelection(layer, ids, tool === 'brush');
  };

  const setLasso = (ring: [number, number][]) => {
    const source = mapRef.current?.getMap().getSource(LASSO) as GeoJSONSource | undefined;
    source?.setData(
      ring.length > 1
        ? {type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: ring}}
        : EMPTY
    );
  };

  const onMouseDown = (e: MapLayerMouseEvent) => {
    if (tool === 'pan' || !layer || e.originalEvent.button !== 0) return;
    if (tool === 'lasso') {
      drag.current = {mode: 'lasso', ring: [e.lngLat.toArray() as [number, number]]};
    } else {
      drag.current = {mode: 'paint', ring: []};
      paintAt(e.point);
    }
  };

  const onMouseMove = (e: MapLayerMouseEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'paint') return paintAt(e.point);
    d.ring.push(e.lngLat.toArray() as [number, number]);
    setLasso(d.ring);
  };

  const onMouseUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode !== 'lasso' || !layer) return;
    setLasso([]);
    if (d.ring.length < 3) return;
    const shape = polygon([[...d.ring, d.ring[0]]]);
    setShapes([...shapes.current, shape]);
    selectInShapes(layer, [shape]);
  };

  const onDownload = async () => {
    if (!layer) return;
    setBusy('Preparing download…');
    setError('');
    const response = await requestExtract({layer, ids: [...selection.current], format});
    setBusy(null);
    if (response.ok) setResult(response.result);
    else setError(response.detail);
  };

  return (
    <Flex className="h-screen">
      <Flex direction="column" gap="4" p="4" className="w-80 shrink-0 overflow-y-auto border-r">
        <Heading size="4">Download data</Heading>
        <Flex direction="column" gap="1">
          <Text size="2" weight="bold">
            Map module
          </Text>
          <Select.Root value={slug} onValueChange={onModuleChange}>
            <Select.Trigger placeholder="Choose a map module" />
            <Select.Content>
              {sortedModules.map(m => (
                <Select.Item key={m.districtr_map_slug} value={m.districtr_map_slug}>
                  {/* v1/v2 modules share names; the slug tells them apart. */}
                  {m.name} ({m.districtr_map_slug})
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>

        {districtrMap && (
          <>
            {districtrMap.child_layer && (
              <Text as="label" size="2">
                <Flex gap="2" align="center">
                  <Switch checked={useChild} onCheckedChange={onLayerChange} />
                  Select blocks instead of{' '}
                  {districtrMap.parent_layer.includes('vtd') ? 'VTDs' : 'parent units'}
                </Flex>
              </Text>
            )}
            <Text size="1" color="gray">
              Units: <code>{layer}</code>
            </Text>

            <Flex direction="column" gap="2">
              <Text size="2" weight="bold">
                Tool
              </Text>
              <SegmentedControl.Root value={tool} onValueChange={v => setTool(v as Tool)}>
                <SegmentedControl.Item value="pan">Pan</SegmentedControl.Item>
                <SegmentedControl.Item value="lasso">Lasso</SegmentedControl.Item>
                <SegmentedControl.Item value="brush">Brush</SegmentedControl.Item>
                <SegmentedControl.Item value="eraser">Erase</SegmentedControl.Item>
              </SegmentedControl.Root>
              {(tool === 'brush' || tool === 'eraser') && (
                <Flex direction="column" gap="1">
                  <Text size="1" color="gray">
                    Brush size
                  </Text>
                  <Slider
                    min={2}
                    max={60}
                    value={[brushSize]}
                    onValueChange={([v]) => setBrushSize(v)}
                  />
                </Flex>
              )}
              <Text size="1" color="gray">
                {tool === 'lasso'
                  ? 'Drag to draw a shape; units whose centre falls inside are selected. Shapes carry over when you switch units.'
                  : tool === 'pan'
                    ? 'Drag to move the map.'
                    : 'Drag over units. Brush and erase edits are dropped if you switch units.'}
              </Text>
            </Flex>

            <Flex direction="column" gap="2">
              <Text size="2">
                <strong>{count.toLocaleString()}</strong> units selected
                {shapes.current.length > 0 && ` · ${shapes.current.length} shape(s)`}
              </Text>
              <Button
                variant="soft"
                color="gray"
                disabled={!count && !shapes.current.length}
                onClick={() => {
                  clearSelection();
                  setShapes([]);
                }}
              >
                Clear selection
              </Button>
            </Flex>

            <Flex direction="column" gap="2">
              <Text size="2" weight="bold">
                Format
              </Text>
              <Select.Root value={format} onValueChange={v => setFormat(v as ExtractFormat)}>
                <Select.Trigger />
                <Select.Content>
                  {FORMATS.map(f => (
                    <Select.Item key={f.value} value={f.value}>
                      {f.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <Button disabled={!count || !!busy} onClick={onDownload}>
                Prepare download
              </Button>
              <Text size="1" color="gray">
                The first download from a layer can take up to a minute.
              </Text>
            </Flex>
          </>
        )}

        {busy && <Text size="2">{busy}</Text>}
        {error && (
          <Text size="2" color="red">
            {error}
          </Text>
        )}
        {result && (
          <Card>
            <Flex direction="column" gap="1">
              <Link href={result.url} weight="bold">
                Download {result.filename}
              </Link>
              <Text size="1" color="gray">
                {result.count.toLocaleString()} units · link expires{' '}
                {new Date(result.expires_at).toLocaleString()}
              </Text>
            </Flex>
          </Card>
        )}
      </Flex>

      <div className="relative flex-1">
        <GlMap
          ref={mapRef}
          mapStyle={MINIMAL_BASEMAP_STYLE_URL}
          initialViewState={{
            longitude: (MAP_OPTIONS.center as [number, number])[0],
            latitude: (MAP_OPTIONS.center as [number, number])[1],
            zoom: MAP_OPTIONS.zoom ?? 3,
          }}
          dragPan={tool === 'pan'}
          dragRotate={false}
          cursor={tool === 'pan' ? 'grab' : 'crosshair'}
          interactiveLayerIds={layer ? [FILL] : []}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseOut={onMouseUp}
        >
          {districtrMap?.tiles_s3_path && layer && (
            <Source
              key={districtrMap.tiles_s3_path}
              id={SOURCE}
              type="vector"
              url={`pmtiles://${TILESET_URL}/${districtrMap.tiles_s3_path}`}
              promoteId="path"
            >
              <Layer
                key={`${layer}-fill`}
                id={FILL}
                type="fill"
                source-layer={layer}
                paint={{
                  'fill-color': ['case', SELECTED, '#2563eb', '#94a3b8'],
                  'fill-opacity': ['case', SELECTED, 0.6, 0.08],
                }}
              />
              <Layer
                key={`${layer}-line`}
                id="extract-outline"
                type="line"
                source-layer={layer}
                paint={{
                  'line-color': '#475569',
                  'line-opacity': 0.5,
                  'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.1, 12, 0.8],
                }}
              />
            </Source>
          )}
          <Source id="extract-shapes" type="geojson" data={shapesData}>
            <Layer
              id="extract-shapes-line"
              type="line"
              paint={{'line-color': '#f97316', 'line-width': 2, 'line-dasharray': [2, 1]}}
            />
          </Source>
          <Source id={LASSO} type="geojson" data={EMPTY}>
            <Layer
              id="extract-lasso-line"
              type="line"
              paint={{'line-color': '#f97316', 'line-width': 2}}
            />
          </Source>
          <NavigationControl showCompass={false} position="bottom-right" />
        </GlMap>
      </div>
    </Flex>
  );
};
