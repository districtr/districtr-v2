import {test, expect} from '@playwright/test';
import {testConfig, testSelectors, testUrls, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocumentRecord,
  navigateToMap,
  settleAfter,
  selectTool,
  waitForMapSettled,
  enableSuperDraw,
} from '../../fixtures/map-fixture';
import {getMapCenter} from '../../utils/map-helpers';
import {mapTools, assignedIn, skipWithoutWebMcp, type ToolError} from '../../utils/webmcp';

/**
 * The map editor's WebMCP tools themselves (src/app/hooks/useWebMcpTools.ts):
 * the contract agents rely on, the edit-capability rule, and the guard that
 * keeps assign_areas from saving a precinct both whole and as blocks (#792).
 */

test.describe('WebMCP map tools', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  let doc: {document_id: string; public_id: number};

  test.beforeEach(async ({page, request}) => {
    doc = await createMapDocumentRecord(request);
    await navigateToMap(page, doc.document_id);
    await skipWithoutWebMcp(page);
  });

  test('registers the six tools, read tools annotated read-only', async ({page}) => {
    const tools = await page.webmcp.tools();
    const byName = Object.fromEntries(tools.map(t => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      'assign_areas',
      'get_district_summary',
      'get_map_state',
      'list_loaded_areas',
      'set_district',
      'set_tool',
    ]);
    for (const name of ['get_map_state', 'get_district_summary', 'list_loaded_areas']) {
      expect(byName[name].annotations?.readOnly, name).toBe(true);
    }
    for (const name of ['assign_areas', 'set_district', 'set_tool']) {
      expect(byName[name].annotations?.readOnly, name).toBeFalsy();
      expect(byName[name].description.length, name).toBeGreaterThan(20);
    }
  });

  test('never returns the document UUID (the edit capability)', async ({page}) => {
    const outputs = JSON.stringify([
      await mapTools.state(page),
      await mapTools.districts(page),
      await mapTools.loadedAreas(page, 5000),
    ]);
    expect(outputs).not.toContain(doc.document_id);
    expect((await mapTools.state(page)).map.public_id).toBe(doc.public_id);
  });

  test('set_tool and set_district drive the toolbar UI', async ({page}) => {
    await mapTools.setTool(page, 'eraser');
    await expect(page.locator(testSelectors.eraserTool)).toHaveAttribute('aria-pressed', 'true');

    await mapTools.setDistrict(page, 3);
    await expect(page.locator(testSelectors.zoneButton(3))).toHaveAttribute(
      'data-state',
      'checked'
    );
    const {map} = await mapTools.state(page, false);
    const tooHigh = (await mapTools.setDistrict(page, map.num_districts! + 1)) as ToolError;
    expect(tooHigh.error).toContain(`${map.num_districts} districts`);
    expect((await mapTools.state(page, false)).selected_zone).toBe(3);
  });

  test('assign_areas assigns, reports unchanged areas, and unassigns with zone null', async ({
    page,
  }) => {
    const ids = (await mapTools.loadedAreas(page, 3)).map(a => a.id);
    expect(await mapTools.assign(page, ids, 2)).toEqual({
      assigned: 3,
      unchanged: 0,
      not_shattered: [],
      not_loaded: [],
    });
    await expect.poll(() => assignedIn(page, 2)).toBe(3);

    // Already in district 2: nothing to paint.
    expect(await mapTools.assign(page, ids, 2)).toMatchObject({assigned: 0, unchanged: 3});

    expect(await mapTools.assign(page, [...ids, 'vtd:not-a-real-id'], null)).toEqual({
      assigned: 3,
      unchanged: 0,
      not_shattered: [],
      not_loaded: ['vtd:not-a-real-id'],
    });
    await expect.poll(async () => (await mapTools.state(page)).assigned_feature_count).toBe(0);
  });

  test('refuses blocks of a precinct that is not broken into blocks', async ({page, request}) => {
    const [precinct] = await mapTools.loadedAreas(page, 1);
    const edges = await request.get(
      `${testConfig.backendURL}/api/gerrydb/edges/${testConfig.testMapSlug}`,
      {params: {parent_geoid: precinct.id}}
    );
    const blocks: string[] = (await edges.json()).map((e: {child_path: string}) => e.child_path);
    expect(blocks.length).toBeGreaterThan(0);

    const result = await mapTools.assign(page, blocks, 4);
    expect(result.assigned).toBe(0);
    // Loaded blocks are refused, not silently dropped; the guard must actually fire.
    expect(result.not_shattered.length).toBeGreaterThan(0);
    expect(result.not_shattered.length + result.not_loaded.length).toBe(blocks.length);
    expect((await mapTools.state(page)).assigned_feature_count).toBe(0);
  });

  test('blocks of a broken precinct are listed with their parent and assignable', async ({
    page,
  }) => {
    // Shatter is a Super Draw tool.
    await enableSuperDraw(page);
    await page.reload();
    await waitForMapSettled(page);
    await selectTool(page, testSelectors.shatterTool);
    const center = await getMapCenter(page);
    await settleAfter(page, () => page.mouse.click(center.x, center.y));

    let blocks: Awaited<ReturnType<typeof mapTools.loadedAreas>> = [];
    await expect
      .poll(async () => {
        blocks = (await mapTools.loadedAreas(page, 5000)).filter(a => a.parent);
        return blocks.length;
      })
      .toBeGreaterThan(0);
    // All from the one precinct that was clicked.
    expect(new Set(blocks.map(b => b.parent)).size).toBe(1);

    const before = await assignedIn(page, 5);
    expect(await mapTools.assign(page, [blocks[0].id], 5)).toMatchObject({assigned: 1});
    await expect.poll(() => assignedIn(page, 5)).toBe(before + 1);
  });
});

test.describe('WebMCP map tools on a view-only map', () => {
  // View pages mount PublicMap, not MainMap, so a viewer's browser gets no tools at all.
  // ponytail: read-only tools for viewers (e.g. district populations) would help screen-reader
  // users; add them to PublicMap if wanted, and change this test to check they can't edit.
  test('registers no tools for a viewer with only the public_id', async ({page, request}) => {
    const {public_id} = await createMapDocumentRecord(request);
    await page.goto(testUrls.mapView(String(public_id)));
    await waitForMapSettled(page);
    const tools = await page.webmcp.tools().catch(() => null);
    test.skip(tools === null, 'Browser has no WebMCP support');
    expect(tools).toEqual([]);
  });
});
