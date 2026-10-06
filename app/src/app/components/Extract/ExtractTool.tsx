'use client';
import maplibregl, {type FilterSpecification, type GeoJSONSource} from 'maplibre-gl';
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
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  Link,
  Select,
  Switch,
  Text,
} from '@radix-ui/themes';
import {
  BorderDashedIcon,
  EraserIcon,
  HamburgerMenuIcon,
  HandIcon,
  Pencil2Icon,
} from '@radix-ui/react-icons';
import {bbox as turfBbox, booleanPointInPolygon, polygon} from '@turf/turf';
import {MAP_OPTIONS, getMapStyleForBasemap} from '@constants/map/viewDefaults';
import {
  BLOCK_SOURCE_ID,
  CANONICAL_LAYER_IDS,
  MAP_LAYER_ANCHOR_IDS,
  type BlockScope,
} from '@constants/map/layerIds';
import {BASEMAP_IDS, EMPTY_FT_COLLECTION} from '@constants/map/layerStyle';
import {MapLayerAnchors} from '@components/Map/MapLayerAnchors';
import {BlockLayers} from '@components/Map/PolygonLayers/BlockLayers';
import {CountyLayers} from '@components/Map/PolygonLayers/CountyLayers';
import {ToolButton} from '@components/Toolbar/ToolButtons';
import {useToolHotkeys, type ActiveToolConfig} from '@components/Toolbar/ToolUtils';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import {useAltHeld} from '@/app/hooks/useAltHeld';
import {useAnchorLayersReady} from '@/app/hooks/useAnchorLayersReady';
import {useMapModules} from '@/app/hooks/useMapModules';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {boxAroundPoint} from '@utils/map/bboxAroundPoint';
import {setHoverFeatures} from '@utils/map/hoverFeatures';
import {getPointSelectionData} from '@/app/utils/api/apiHandlers/getPointSelectionData';
import {CMS_PUBLIC_URL, TILESET_URL} from '@/app/utils/api/constants';
import {
  getExtractToken,
  requestExtract,
  type ExtractFormat,
  type ExtractResult,
  type ExtractToken,
} from '@/app/utils/api/extract';

/**
 * Data-extract page. It reuses the editor's look rather than its machinery:
 * the toolbar buttons, brush-size control, block/county layers, and hover
 * state are the editor's own; the selection is local. The editor stores
 * assume a document (IndexedDB writes, autosave, undo), so they aren't used.
 */

type ExtractToolMode = 'pan' | 'lasso' | 'brush' | 'eraser';

const TOOLS: ActiveToolConfig<ExtractToolMode>[] = [
  {
    mode: 'pan',
    label: 'Move',
    icon: HandIcon,
    hotKeyLabel: 'M',
    hotKeyAccessor: e => e.code === 'KeyM',
  },
  {
    mode: 'lasso',
    label: 'Lasso',
    icon: BorderDashedIcon,
    hotKeyLabel: 'L',
    hotKeyAccessor: e => e.code === 'KeyL',
  },
  {
    mode: 'brush',
    label: 'Paint',
    icon: Pencil2Icon,
    hotKeyLabel: 'P',
    hotKeyAccessor: e => e.code === 'KeyP',
  },
  {
    mode: 'eraser',
    label: 'Erase',
    icon: EraserIcon,
    hotKeyLabel: 'E',
    hotKeyAccessor: e => e.code === 'KeyE',
  },
];

const FORMATS: {value: ExtractFormat; label: string}[] = [
  {value: 'gpkg', label: 'GeoPackage'},
  {value: 'shp', label: 'Shapefile (zip)'},
  {value: 'geojson', label: 'GeoJSON'},
  {value: 'csv', label: 'CSV (no geometry)'},
];

// Selected units are drawn as zone 1 by the editor's own zone layers.
const SELECTED_ZONE = 1;
const ALL: FilterSpecification = ['literal', true];
const LASSO = 'extract-lasso';
type Shape = GeoJSON.Feature<GeoJSON.Polygon>;

// Centroids come from tilesets/{layer}_points.parquet, which the editor
// already loads; cached per layer for the page's lifetime.
const pointCache = new Map<string, Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>>();
const loadPoints = (layer: string) => {
  if (!pointCache.has(layer)) {
    const points = getPointSelectionData({
      layer,
      columns: ['path', 'x', 'y'],
      source: BLOCK_SOURCE_ID,
    });
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
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const basemap = useMapControlsStore(state => state.mapOptions.basemap ?? BASEMAP_IDS.MINIMAL);
  const areAnchorLayersReady = useAnchorLayersReady(mapRef, isMapLoaded, basemap);
  const brushSize = useMapControlsStore(state => state.brushSize);
  const showHotkeyHints = useAltHeld();

  const modules = useMapModules();
  const sortedModules = useMemo(
    () => [...modules].sort((a, b) => a.name.localeCompare(b.name)),
    [modules]
  );
  const [slug, setSlug] = useState<string>();
  const districtrMap = modules.find(m => m.districtr_map_slug === slug);
  const [useChild, setUseChild] = useState(false);
  const scope: BlockScope = useChild && districtrMap?.child_layer ? 'CHILD' : 'PARENT';
  const layer = districtrMap
    ? scope === 'CHILD'
      ? districtrMap.child_layer!
      : districtrMap.parent_layer
    : undefined;
  const hoverLayerId = CANONICAL_LAYER_IDS.BLOCK[scope].HOVER;

  const [tool, setTool] = useState<ExtractToolMode>('lasso');
  const tools = TOOLS.map(t => ({...t, disabled: !layer}));
  useToolHotkeys(tools, setTool);
  const [format, setFormat] = useState<ExtractFormat>('gpkg');
  // Shapes outlive a unit swap; the selection is re-derived from them.
  const shapes = useRef<Shape[]>([]);
  const [shapesData, setShapesData] = useState<GeoJSON.FeatureCollection>(EMPTY_FT_COLLECTION);
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
      map.setFeatureState(
        {source: BLOCK_SOURCE_ID, sourceLayer: onLayer, id},
        {zone: selected ? SELECTED_ZONE : null}
      );
    }
    setCount(selection.current.size);
    setResult(null);
  };

  const clearSelection = () => {
    const map = mapRef.current?.getMap();
    if (map?.getSource(BLOCK_SOURCE_ID) && layer) {
      map.removeFeatureState({source: BLOCK_SOURCE_ID, sourceLayer: layer});
    }
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

  const onUnitsChange = (child: boolean) => {
    if (!districtrMap) return;
    clearSelection();
    setUseChild(child);
    const nextLayer =
      child && districtrMap.child_layer ? districtrMap.child_layer : districtrMap.parent_layer;
    // Brush edits don't carry over: they are the other layer's ids.
    if (shapes.current.length) selectInShapes(nextLayer, shapes.current);
  };

  // Same brush geometry as the editor (boxAroundPoint on the hover layer).
  const unitsUnderBrush = (e: MapLayerMouseEvent) =>
    mapRef.current?.getMap().queryRenderedFeatures(boxAroundPoint(e, brushSize), {
      layers: [hoverLayerId],
    }) ?? [];

  const setLasso = (ring: [number, number][]) => {
    const source = mapRef.current?.getMap().getSource(LASSO) as GeoJSONSource | undefined;
    source?.setData(
      ring.length > 1
        ? {type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: ring}}
        : EMPTY_FT_COLLECTION
    );
  };

  const onMouseDown = (e: MapLayerMouseEvent) => {
    if (tool === 'pan' || !layer || e.originalEvent.button !== 0) return;
    if (tool === 'lasso') {
      drag.current = {mode: 'lasso', ring: [e.lngLat.toArray() as [number, number]]};
    } else {
      drag.current = {mode: 'paint', ring: []};
      applySelection(
        layer,
        unitsUnderBrush(e).map(f => String(f.id)),
        tool === 'brush'
      );
    }
  };

  const onMouseMove = (e: MapLayerMouseEvent) => {
    if (!layer) return;
    const isBrush = tool === 'brush' || tool === 'eraser';
    const features = isBrush ? unitsUnderBrush(e) : [];
    if (isBrush) setHoverFeatures(features);
    const d = drag.current;
    if (d?.mode === 'paint') {
      applySelection(
        layer,
        features.map(f => String(f.id)),
        tool === 'brush'
      );
    } else if (d?.mode === 'lasso') {
      d.ring.push(e.lngLat.toArray() as [number, number]);
      setLasso(d.ring);
    }
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

  const unitsLabel = scope === 'CHILD' ? 'Blocks' : layer?.includes('vtd') ? 'VTDs' : 'Units';

  return (
    // Same frame as the editor's MapPage: sidebar on the right, topbar over the map.
    <div className="h-screen h-dvh w-screen overflow-hidden flex flex-row-reverse">
      <div
        className="p-3 z-10 flex-none border-l-[1px] border-gray-500 shadow-xl overflow-y-auto"
        style={{width: '35vw', minWidth: 320}}
      >
        <Flex direction="column" gap="3">
          <Box className="my-1 pb-3 border-b-[1px] border-gray-300">
            <Flex direction="column" gap="3">
              <Flex direction="row" wrap="wrap" gap="1">
                {tools.map(t => (
                  <ToolButton
                    key={t.mode}
                    tool={t}
                    isActive={tool === t.mode}
                    onClick={() => setTool(tool === t.mode ? 'pan' : t.mode)}
                    showHotkeyHint={showHotkeyHints}
                    style={{minWidth: 40, flexGrow: 1, flexBasis: 0}}
                  />
                ))}
              </Flex>
              {(tool === 'brush' || tool === 'eraser') && <BrushSizeSelector />}
              {tool === 'lasso' && (
                <Text size="2" color="gray">
                  Drag to draw a shape. Units whose centre falls inside are selected, and shapes
                  carry over when you switch units.
                </Text>
              )}
            </Flex>
          </Box>

          <Card>
            <Flex direction="column" gap="2">
              <Heading size="3">Map module</Heading>
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
              {districtrMap?.child_layer && (
                <Text as="label" size="2">
                  <Flex gap="2" align="center">
                    <Switch checked={useChild} onCheckedChange={onUnitsChange} />
                    Select blocks instead of{' '}
                    {districtrMap.parent_layer.includes('vtd') ? 'VTDs' : 'parent units'}
                  </Flex>
                </Text>
              )}
              {layer && (
                <Text size="1" color="gray">
                  Source layer: <code>{layer}</code>
                </Text>
              )}
            </Flex>
          </Card>

          {districtrMap && (
            <Card>
              <Flex direction="column" gap="2">
                <Heading size="3">Download</Heading>
                <Text size="2">
                  <strong>{count.toLocaleString()}</strong> {unitsLabel.toLowerCase()} selected
                  {shapes.current.length > 0 && ` · ${shapes.current.length} shape(s)`}
                </Text>
                <Flex gap="2" align="center">
                  <Select.Root value={format} onValueChange={v => setFormat(v as ExtractFormat)}>
                    <Select.Trigger className="flex-1" />
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
                </Flex>
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
                {busy && <Text size="2">{busy}</Text>}
                {error && (
                  <Text size="2" color="red">
                    {error}
                  </Text>
                )}
                {result && (
                  <Flex direction="column" gap="1">
                    <Link href={result.url} weight="bold">
                      Download {result.filename}
                    </Link>
                    <Text size="1" color="gray">
                      {result.count.toLocaleString()} units · link expires{' '}
                      {new Date(result.expires_at).toLocaleString()}
                    </Text>
                  </Flex>
                )}
                <Text size="1" color="gray">
                  The first download from a layer can take up to a minute.
                </Text>
              </Flex>
            </Card>
          )}
        </Flex>
      </div>

      <div className="h-full relative w-full flex-1 flex flex-col">
        {/* Echoes the editor's Topbar. */}
        <Flex
          align="center"
          justify="between"
          gap="4"
          className="border-b-[1px] border-gray-500 shadow-xl p-1 pl-5 pr-4 relative z-10 min-h-[45px]"
        >
          <IconButton variant="ghost" asChild>
            <a href="/" className="ml-2">
              <HamburgerMenuIcon className="mr-2" />
              <Heading size="3">Districtr</Heading>
            </a>
          </IconButton>
          <Text size="2" weight="bold">
            Download data
            {districtrMap && (
              <Text weight="regular" color="gray">
                {' '}
                · {districtrMap.name} · {unitsLabel}
              </Text>
            )}
          </Text>
        </Flex>
        <div className={`flex-1 min-h-0 relative cursor-${tool}`}>
          <GlMap
            ref={mapRef}
            mapStyle={getMapStyleForBasemap(basemap)}
            initialViewState={{
              longitude: (MAP_OPTIONS.center as [number, number])[0],
              latitude: (MAP_OPTIONS.center as [number, number])[1],
              zoom: MAP_OPTIONS.zoom ?? 3,
            }}
            maxZoom={MAP_OPTIONS.maxZoom || undefined}
            pitchWithRotate={false}
            maxPitch={0}
            minPitch={0}
            dragRotate={false}
            dragPan={tool === 'pan'}
            onLoad={() => {
              // setHoverFeatures (and the editor's other map utils) read the map from mapStore.
              useMapStore.getState().setMapRef(mapRef);
              setIsMapLoaded(true);
            }}
            interactiveLayerIds={layer ? [hoverLayerId] : []}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseOut={() => {
              setHoverFeatures([]);
              onMouseUp();
            }}
          >
            {isMapLoaded && <MapLayerAnchors />}
            {areAnchorLayersReady && (
              <>
                <CountyLayers layerBeforeId={MAP_LAYER_ANCHOR_IDS.countyBoundaries} />
                {districtrMap?.tiles_s3_path && layer && (
                  <Source
                    key={districtrMap.tiles_s3_path}
                    id={BLOCK_SOURCE_ID}
                    type="vector"
                    url={`pmtiles://${TILESET_URL}/${districtrMap.tiles_s3_path}`}
                    promoteId="path"
                  >
                    <BlockLayers
                      key={layer}
                      scope={scope}
                      layerFilter={ALL}
                      outlineFilter={ALL}
                      sourceLayerId={layer}
                    />
                  </Source>
                )}
                <Source id="extract-shapes" type="geojson" data={shapesData}>
                  <Layer
                    id="extract-shapes-line"
                    type="line"
                    beforeId={MAP_LAYER_ANCHOR_IDS.hover}
                    paint={{'line-color': '#000', 'line-width': 2, 'line-dasharray': [2, 1]}}
                  />
                </Source>
                <Source id={LASSO} type="geojson" data={EMPTY_FT_COLLECTION}>
                  <Layer
                    id="extract-lasso-line"
                    type="line"
                    beforeId={MAP_LAYER_ANCHOR_IDS.hover}
                    paint={{'line-color': '#000', 'line-width': 2}}
                  />
                </Source>
              </>
            )}
            <NavigationControl showCompass={false} showZoom={true} position="bottom-right" />
          </GlMap>
        </div>
      </div>
    </div>
  );
};
