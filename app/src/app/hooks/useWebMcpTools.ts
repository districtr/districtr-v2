import {useEffect} from 'react';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useAssignmentsStore} from '@store/assignmentsStore';
import {demographyService} from '@utils/demography/demographyService';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {ACCESS_STATES} from '@constants/document/state';
import {BLOCK_SOURCE_ID} from '@constants/map/layerIds';

/**
 * WebMCP tools for the map editor (https://webmachinelearning.github.io/webmcp/).
 *
 * Lets a browser agent (Gemini in Chrome, an extension, Playwright's page.webmcp)
 * read map state and paint by GEOID without driving the WebGL canvas. A no-op
 * unless the browser exposes document.modelContext (Chrome 149+ with the WebMCP
 * origin trial or chrome://flags/#enable-webmcp-testing).
 *
 * Never return document_id: it is the edit capability. public_id only.
 */

type ModelContextTool = {
  name: string;
  description: string;
  inputSchema?: object;
  annotations?: {readOnlyHint?: boolean; consequentialHint?: boolean};
  execute: (input: any) => Promise<unknown>;
};
type ModelContext = {
  registerTool: (tool: ModelContextTool, options?: {signal?: AbortSignal}) => unknown;
};

const getModelContext = (): ModelContext | undefined =>
  // Chrome 150 moved it from navigator to document; navigator stays as an alias.
  (document as any).modelContext ?? (navigator as any).modelContext;

const canEdit = () => useMapStore.getState().mapStatus?.access === ACCESS_STATES.EDIT;

const isSettled = () => {
  const {appLoadingState, mapRenderingState, getMapRef} = useMapStore.getState();
  const map = getMapRef();
  return (
    appLoadingState === 'loaded' &&
    mapRenderingState === 'loaded' &&
    !!map?.loaded() &&
    map.getContainer().dataset.idle === 'true'
  );
};

// ponytail: 50ms poll; switch to a map 'idle' listener if this shows up in profiles.
const waitUntilSettled = async (timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (!isSettled()) {
    if (Date.now() > deadline) return false;
    await new Promise(r => setTimeout(r, 50));
  }
  return true;
};

const mapState = () => {
  const {mapDocument, mapStatus, appLoadingState, mapRenderingState} = useMapStore.getState();
  const {selectedZone, activeTool} = useMapControlsStore.getState();
  const {zoneAssignments} = useAssignmentsStore.getState();
  let assigned = 0;
  zoneAssignments.forEach(zone => zone !== null && assigned++);
  return {
    settled: isSettled(),
    app_state: appLoadingState,
    render_state: mapRenderingState,
    map: mapDocument && {
      public_id: mapDocument.public_id,
      map_slug: mapDocument.districtr_map_slug,
      num_districts: mapDocument.num_districts,
      access: mapStatus?.access ?? null,
    },
    selected_zone: selectedZone,
    active_tool: activeTool,
    assigned_feature_count: assigned,
  };
};

const tools: ModelContextTool[] = [
  {
    name: 'get_map_state',
    description:
      'Current state of the open districting map: loading state, selected district, active tool, and how many areas are assigned. Pass wait_until_settled to wait for tiles and repaints to finish first.',
    inputSchema: {
      type: 'object',
      properties: {
        wait_until_settled: {type: 'boolean', description: 'Wait for the map to finish rendering.'},
        timeout_ms: {type: 'integer', minimum: 0, maximum: 60000, default: 15000},
      },
    },
    annotations: {readOnlyHint: true},
    execute: async ({wait_until_settled = false, timeout_ms = 15000} = {}) => {
      if (wait_until_settled && !(await waitUntilSettled(timeout_ms))) {
        return {error: `Map did not settle within ${timeout_ms}ms`, ...mapState()};
      }
      return mapState();
    },
  },
  {
    name: 'get_district_summary',
    description:
      'Population and number of assigned areas for each district (zone). The zone null row is unassigned population.',
    inputSchema: {type: 'object', properties: {}},
    annotations: {readOnlyHint: true},
    execute: async () => {
      const counts = new Map<number | null, number>();
      useAssignmentsStore
        .getState()
        .zoneAssignments.forEach(zone => counts.set(zone, (counts.get(zone) ?? 0) + 1));
      return demographyService.populations.map(row =>
        row.zone == null
          ? {zone: null, population: row.total_pop_20}
          : {
              zone: row.zone,
              population: row.total_pop_20,
              assigned_areas: counts.get(row.zone) ?? 0,
            }
      );
    },
  },
  {
    name: 'list_loaded_areas',
    description:
      'Areas (precincts/VTDs) in the currently loaded map tiles, with GEOID, district, and population. Precincts already broken into blocks are replaced by their blocks, which carry the parent precinct id. Use the ids with assign_areas. Pan or zoom the map to load other areas.',
    inputSchema: {
      type: 'object',
      properties: {limit: {type: 'integer', minimum: 1, maximum: 5000, default: 100}},
    },
    annotations: {readOnlyHint: true},
    execute: async ({limit = 100} = {}) => {
      const {getMapRef, mapDocument} = useMapStore.getState();
      const map = getMapRef();
      if (!map || !mapDocument) return {error: 'Map is not loaded yet.'};
      const {zoneAssignments, shatterIds, childToParent} = useAssignmentsStore.getState();
      type Area = {id: string; zone: number | null; population: number; parent?: string};
      const areas = new Map<string, Area>();
      const collect = (sourceLayer: string, include: (id: string) => boolean) => {
        for (const f of map.querySourceFeatures(BLOCK_SOURCE_ID, {sourceLayer})) {
          if (areas.size >= limit) return;
          const id = f.id?.toString();
          if (!id || areas.has(id) || !include(id)) continue;
          const parent = childToParent.get(id);
          areas.set(id, {
            id,
            zone: zoneAssignments.get(id) ?? null,
            population: Number(f.properties?.total_pop_20) || 0,
            ...(parent && {parent}),
          });
        }
      };
      // Blocks first: there are few, and the limit would otherwise crowd them out.
      if (mapDocument.child_layer)
        collect(mapDocument.child_layer, id => shatterIds.children.has(id));
      collect(mapDocument.parent_layer, id => !shatterIds.parents.has(id));
      return [...areas.values()];
    },
  },
  {
    name: 'set_tool',
    description: 'Switch the active map tool. Requires edit access.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: {type: 'string', enum: [ACTIVE_TOOLS.PAN, ACTIVE_TOOLS.BRUSH, ACTIVE_TOOLS.ERASER]},
      },
      required: ['tool'],
    },
    execute: async ({tool}) => {
      if (!canEdit()) return {error: 'This map is view-only.'};
      useMapControlsStore.getState().setActiveTool(tool);
      return {active_tool: useMapControlsStore.getState().activeTool};
    },
  },
  {
    name: 'set_district',
    description: 'Choose which district (zone number, starting at 1) the brush paints.',
    inputSchema: {
      type: 'object',
      properties: {zone: {type: 'integer', minimum: 1}},
      required: ['zone'],
    },
    execute: async ({zone}) => {
      const max = useMapStore.getState().mapDocument?.num_districts ?? Infinity;
      if (zone > max) return {error: `This map has ${max} districts.`};
      useMapControlsStore.getState().setSelectedZone(zone);
      return {selected_zone: useMapControlsStore.getState().selectedZone};
    },
  },
  {
    name: 'assign_areas',
    description:
      'Assign map areas (by GEOID, as shown in the map tooltip or inspector) to a district, or unassign them with zone null. Works like painting, so undo reverts it. Only areas in currently loaded map tiles can be assigned (others come back in not_loaded), and blocks only inside precincts already broken into blocks (others come back in not_shattered). unchanged counts locked areas, broken precincts, and areas already in that district.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 5000},
        zone: {type: ['integer', 'null'], minimum: 1},
      },
      required: ['ids', 'zone'],
    },
    execute: async ({ids, zone}: {ids: string[]; zone: number | null}) => {
      if (!canEdit()) return {error: 'This map is view-only.'};
      const {getMapRef, mapDocument} = useMapStore.getState();
      const map = getMapRef();
      const sourceLayer = mapDocument?.parent_layer;
      if (!map || !sourceLayer) return {error: 'Map is not loaded yet.'};
      const {mutateZoneAssignments, ingestAccumulatedAssignments, shatterIds} =
        useAssignmentsStore.getState();
      const wanted = new Set(ids.map(String));
      // querySourceFeatures ignores layer filters, so it also returns blocks of unshattered
      // parents; painting those saves a VTD both whole and as blocks (#792). Children only
      // when already shattered.
      const layers: Array<[string, (id: string) => boolean]> = [[sourceLayer, () => true]];
      if (mapDocument?.child_layer) {
        layers.push([mapDocument.child_layer, id => shatterIds.children.has(id)]);
      }
      // One copy per tile comes back; dedupe by id.
      const found = new Map<string, MapGeoJSONFeature>();
      const notShattered = new Set<string>();
      layers.forEach(([layer, allowed]) =>
        map.querySourceFeatures(BLOCK_SOURCE_ID, {sourceLayer: layer}).forEach(f => {
          const id = f.id?.toString();
          if (!id || !wanted.has(id) || found.has(id)) return;
          if (!allowed(id)) {
            notShattered.add(id);
            return;
          }
          // querySourceFeatures leaves sourceLayer unset; the paint path keys feature-state on it.
          found.set(id, Object.assign(f, {sourceLayer: layer}) as MapGeoJSONFeature);
        })
      );
      mutateZoneAssignments(map, [...found.values()], zone);
      // The paint path skips locked areas, broken precincts, and areas already in the zone.
      const assigned = useAssignmentsStore.getState().accumulatedAssignments.size;
      ingestAccumulatedAssignments();
      return {
        assigned,
        unchanged: found.size - assigned,
        not_shattered: [...notShattered],
        not_loaded: [...wanted].filter(id => !found.has(id) && !notShattered.has(id)),
      };
    },
  },
];

/** Registers the map editor's WebMCP tools for the lifetime of the calling component. */
export const useWebMcpTools = () => {
  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;
    const controller = new AbortController();
    tools.forEach(tool => {
      try {
        Promise.resolve(modelContext.registerTool(tool, {signal: controller.signal})).catch(err =>
          console.warn(`WebMCP: could not register ${tool.name}`, err)
        );
      } catch (err) {
        console.warn(`WebMCP: could not register ${tool.name}`, err);
      }
    });
    return () => controller.abort();
  }, []);
};
