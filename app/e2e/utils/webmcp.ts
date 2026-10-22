import {Page, test} from '@playwright/test';

/**
 * Typed wrappers over Playwright's page.webmcp for the map editor's tools
 * (src/app/hooks/useWebMcpTools.ts). Needs a browser launched with WebMCP
 * (see playwright.config.ts); skipWithoutWebMcp skips the test otherwise.
 */

export type MapState = {
  settled: boolean;
  app_state: string;
  render_state: string;
  map: {public_id: number | null; map_slug: string; num_districts: number | null; access: string};
  selected_zone: number;
  active_tool: string;
  assigned_feature_count: number;
};
export type DistrictRow = {zone: number | null; population: number; assigned_areas: number};
export type Area = {id: string; zone: number | null; population: number; parent?: string};
export type AssignResult = {
  assigned: number;
  unchanged: number;
  not_shattered: string[];
  not_loaded: string[];
};
export type ToolError = {error: string};

async function call<T>(page: Page, name: string, input: object = {}): Promise<T> {
  const result = await page.webmcp.callTool(name, input);
  // The spec serializes tool results to JSON strings; tolerate either shape.
  return (typeof result === 'string' ? JSON.parse(result) : result) as T;
}

export const mapTools = {
  state: (page: Page, waitUntilSettled = true) =>
    call<MapState>(page, 'get_map_state', {wait_until_settled: waitUntilSettled}),
  districts: (page: Page) => call<DistrictRow[]>(page, 'get_district_summary'),
  loadedAreas: (page: Page, limit = 100) => call<Area[]>(page, 'list_loaded_areas', {limit}),
  setTool: (page: Page, tool: 'pan' | 'brush' | 'eraser') => call(page, 'set_tool', {tool}),
  setDistrict: (page: Page, zone: number) => call(page, 'set_district', {zone}),
  assign: (page: Page, ids: string[], zone: number | null) =>
    call<AssignResult>(page, 'assign_areas', {ids, zone}),
};

/** Areas assigned to one zone, from get_district_summary. */
export async function assignedIn(page: Page, zone: number): Promise<number> {
  const rows = await mapTools.districts(page);
  return rows.find(r => r.zone === zone)?.assigned_areas ?? 0;
}

/** Skip unless the page registered the map tools (WebMCP enabled and map mounted). */
export async function skipWithoutWebMcp(page: Page): Promise<void> {
  const names = await page.webmcp
    .tools()
    .then(tools => tools.map(t => t.name))
    .catch(() => [] as string[]);
  test.skip(!names.includes('get_map_state'), 'Browser has no WebMCP support');
}
