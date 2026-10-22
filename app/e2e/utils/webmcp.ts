import {Page, test, expect} from '@playwright/test';

/**
 * Typed wrappers over Playwright's page.webmcp for the map editor's tools
 * (src/app/hooks/useWebMcpTools.ts). Needs a browser launched with WebMCP
 * (see playwright.config.ts). skipWithoutWebMcp skips only when the browser lacks
 * WebMCP; if it has it, missing tools fail the test.
 */

export type MapState = {
  settled: boolean;
  app_state: string;
  render_state: string;
  zoom: number;
  map: {public_id: number | null; map_slug: string; num_districts: number | null; access: string};
  selected_zone: number;
  active_tool: string;
  assigned_feature_count: number;
};
// assigned_areas is absent on the zone-null (unassigned population) row.
export type DistrictRow = {zone: number | null; population: number; assigned_areas?: number};
export type Area = {id: string; zone: number | null; population: number; parent?: string};
export type AssignResult = {
  assigned: number;
  unchanged: number;
  refused: string[];
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
  setTool: (page: Page, tool: string) => call(page, 'set_tool', {tool}),
  setDistrict: (page: Page, zone: unknown) => call(page, 'set_district', {zone}),
  assign: (page: Page, ids: string[], zone: number | null) =>
    call<AssignResult>(page, 'assign_areas', {ids, zone}),
  /** Raw call for malformed-input tests; the tool must answer {error}. */
  assignRaw: (page: Page, input: object) =>
    call<AssignResult | ToolError>(page, 'assign_areas', input),
};

/** Areas assigned to one zone, from get_district_summary. */
export async function assignedIn(page: Page, zone: number): Promise<number> {
  const rows = await mapTools.districts(page);
  return rows.find(r => r.zone === zone)?.assigned_areas ?? 0;
}

/** Whether this browser exposes WebMCP at all (launch flag or origin trial). */
export async function hasWebMcp(page: Page): Promise<boolean> {
  return page.evaluate(() => !!((document as any).modelContext ?? (navigator as any).modelContext));
}

/**
 * Skip when the browser has no WebMCP. When it does, the map tools must be registered:
 * a regression in useWebMcpTools fails the test instead of silently skipping it.
 */
export async function skipWithoutWebMcp(page: Page): Promise<void> {
  test.skip(!(await hasWebMcp(page)), 'Browser has no WebMCP support');
  await expect
    .poll(async () => (await page.webmcp.tools()).map(t => t.name), {
      message: 'WebMCP is available but the map tools are not registered',
    })
    .toContain('get_map_state');
}
