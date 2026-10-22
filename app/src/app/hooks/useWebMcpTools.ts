import {useEffect} from 'react';
import type {MapGeoJSONFeature} from 'maplibre-gl';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useAssignmentsStore} from '@store/assignmentsStore';
import {demographyService} from '@utils/demography/demographyService';
import {ACTIVE_TOOLS, DISTRICT_EDIT_TOOLS, type ActiveTool} from '@constants/map/tools';
import {ACCESS_STATES, APP_LOADING_STATES} from '@constants/document/state';
import {RENDERING_STATES} from '@constants/map/renderingState';
import {BLOCK_SOURCE_ID} from '@constants/map/layerIds';
import {filterFeatures} from '@utils/map/filterFeatures';

/**
 * WebMCP tools for the map editor (https://webmachinelearning.github.io/webmcp/).
 *
 * Lets a browser agent (Gemini in Chrome, an extension, Playwright's page.webmcp)
 * read map state and paint by GEOID without driving the WebGL canvas. A no-op
 * unless the browser exposes document.modelContext. districtr registers no
 * origin-trial token, so today that means chrome://flags/#enable-webmcp-testing
 * (or Playwright's --enable-features=WebMCP).
 *
 * Never return document_id: it is the edit capability. public_id only.
 *
 * Browsers don't enforce inputSchema, so every tool validates its own arguments,
 * and mutating tools apply the same rules the toolbar does (edit access, map lock,
 * hidden districts #814, district locks, Forbid paint-over, paint mask).
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

const isDistrict = (zone: unknown): zone is number => {
  const max = useMapStore.getState().mapDocument?.num_districts ?? 0;
  return Number.isInteger(zone) && (zone as number) >= 1 && (zone as number) <= max;
};

const AGENT_TOOLS: ActiveTool[] = [ACTIVE_TOOLS.PAN, ACTIVE_TOOLS.BRUSH, ACTIVE_TOOLS.ERASER];

/** Why the map can't be edited right now, or null. The UI blocks these states for people. */
const editBlocker = (): string | null => {
  if (!canEdit()) return 'This map is view-only.';
  const {mapLock, appLoadingState} = useMapStore.getState();
  if (mapLock) return `The map is busy${mapLock.reason ? ` (${mapLock.reason})` : ''}; try again.`;
  if (appLoadingState !== APP_LOADING_STATES.LOADED) return 'The map is still loading.';
  if (useMapControlsStore.getState().mapOptions.showPaintedDistricts === false) {
    return 'Painted districts are hidden; show them before editing.';
  }
  return null;
};

const isSettled = () => {
  const {appLoadingState, mapRenderingState, getMapRef} = useMapStore.getState();
  const map = getMapRef();
  return (
    appLoadingState === APP_LOADING_STATES.LOADED &&
    mapRenderingState === RENDERING_STATES.LOADED &&
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
  const {mapDocument, mapStatus, appLoadingState, mapRenderingState, getMapRef} =
    useMapStore.getState();
  const {selectedZone, activeTool} = useMapControlsStore.getState();
  const {zoneAssignments} = useAssignmentsStore.getState();
  let assigned = 0;
  zoneAssignments.forEach(zone => zone !== null && assigned++);
  return {
    settled: isSettled(),
    app_state: appLoadingState,
    render_state: mapRenderingState,
    zoom: Math.round((getMapRef()?.getZoom() ?? 0) * 100) / 100,
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
      'Current state of the open districting map: loading state, zoom level, selected district, active tool, and how many areas are assigned. Pass wait_until_settled to wait for tiles and repaints to finish first.',
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
      if (!AGENT_TOOLS.includes(tool)) return {error: `tool must be one of ${AGENT_TOOLS}.`};
      const blocker = DISTRICT_EDIT_TOOLS.includes(tool) ? editBlocker() : null;
      if (blocker) return {error: blocker};
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
      if (!isDistrict(zone)) {
        const max = useMapStore.getState().mapDocument?.num_districts;
        return {error: `zone must be a whole number from 1 to ${max}.`};
      }
      useMapControlsStore.getState().setSelectedZone(zone);
      return {selected_zone: useMapControlsStore.getState().selectedZone};
    },
  },
  {
    name: 'assign_areas',
    description:
      'Assign map areas (by GEOID, as shown in the map tooltip or inspector) to a district, or unassign them with zone null. Works like painting, so undo reverts it, and follows the same rules: areas in a locked district, already-painted areas when Forbid paint-over is on, and areas outside the paint mask or focused area, and precincts already broken into blocks (assign their blocks instead) come back in refused. Only areas in currently loaded map tiles can be assigned (others come back in not_loaded), and blocks only inside precincts already broken into blocks (others come back in not_shattered). unchanged counts areas already in that district.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {type: 'array', items: {type: 'string'}, minItems: 1, maxItems: 5000},
        zone: {type: ['integer', 'null'], minimum: 1},
      },
      required: ['ids', 'zone'],
    },
    annotations: {consequentialHint: true},
    execute: async ({ids, zone}: {ids: unknown; zone: unknown}) => {
      if (
        !Array.isArray(ids) ||
        ids.length < 1 ||
        ids.length > 5000 ||
        !ids.every(id => typeof id === 'string')
      ) {
        return {error: 'ids must be an array of 1 to 5000 GEOID strings.'};
      }
      if (zone !== null && !isDistrict(zone)) {
        const max = useMapStore.getState().mapDocument?.num_districts;
        return {error: `zone must be null or a whole number from 1 to ${max}.`};
      }
      const blocker = editBlocker();
      if (blocker) return {error: blocker};
      const {lockPaintedAreas, disallowPaintOver} = useMapControlsStore.getState().mapOptions;
      if (zone !== null && lockPaintedAreas.includes(zone)) {
        return {error: `District ${zone} is locked.`};
      }
      const {getMapRef, mapDocument} = useMapStore.getState();
      const map = getMapRef();
      const sourceLayer = mapDocument?.parent_layer;
      if (!map || !sourceLayer) return {error: 'Map is not loaded yet.'};
      const {mutateZoneAssignments, ingestAccumulatedAssignments, shatterIds, zoneAssignments} =
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
      // Paint mask, focused area (captive ids) and broken precincts, as in the paint path.
      // Locks and paint-over are applied here instead: filterFeatures keys them on the
      // brush's selected district, and this tool targets `zone`.
      const allowed = filterFeatures({_features: [...found.values()], filterLocked: false}).filter(
        f => {
          const current = zoneAssignments.get(f.id!.toString()) ?? null;
          if (current !== null && lockPaintedAreas.includes(current)) return false;
          return !(disallowPaintOver && zone !== null && current !== null);
        }
      );
      const allowedIds = new Set(allowed.map(f => f.id!.toString()));
      // Count only this call's areas: a stroke in progress may already be buffered.
      const before = useAssignmentsStore.getState().accumulatedAssignments.size;
      mutateZoneAssignments(map, allowed, zone);
      const assigned = useAssignmentsStore.getState().accumulatedAssignments.size - before;
      ingestAccumulatedAssignments();
      return {
        assigned,
        unchanged: allowed.length - assigned,
        refused: [...found.keys()].filter(id => !allowedIds.has(id)),
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
