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

  test('registers the map tools, read tools annotated read-only', async ({page}) => {
    const tools = await page.webmcp.tools();
    const byName = Object.fromEntries(tools.map(t => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      'assign_areas',
      'get_district_summary',
      'get_map_state',
      'list_loaded_areas',
      'locate_area',
      'set_district',
      'set_tool',
    ]);
    for (const name of [
      'get_map_state',
      'get_district_summary',
      'list_loaded_areas',
      'locate_area',
    ]) {
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
    expect(tooHigh.error).toContain(`1 to ${map.num_districts}`);
    expect((await mapTools.state(page, false)).selected_zone).toBe(3);
  });

  test('assign_areas assigns, reports unchanged areas, and unassigns with zone null', async ({
    page,
  }) => {
    const ids = (await mapTools.loadedAreas(page, 3)).map(a => a.id);
    expect(await mapTools.assign(page, ids, 2)).toEqual({
      assigned: 3,
      unchanged: 0,
      refused: [],
      not_shattered: [],
      not_loaded: [],
    });
    await expect.poll(() => assignedIn(page, 2)).toBe(3);

    // Already in district 2: nothing to paint.
    expect(await mapTools.assign(page, ids, 2)).toMatchObject({assigned: 0, unchanged: 3});

    expect(await mapTools.assign(page, [...ids, 'vtd:not-a-real-id'], null)).toEqual({
      assigned: 3,
      unchanged: 0,
      refused: [],
      not_shattered: [],
      not_loaded: ['vtd:not-a-real-id'],
    });
    await expect.poll(async () => (await mapTools.state(page)).assigned_feature_count).toBe(0);
  });

  test('rejects malformed arguments, and the map still saves', async ({page}) => {
    // Browsers don't enforce inputSchema; each of these once reached the paint path and
    // either saved a phantom district, broke every later save (422), or crashed the editor.
    const [area] = await mapTools.loadedAreas(page, 1);
    const {map} = await mapTools.state(page, false);
    const badAssign: object[] = [
      {ids: [area.id], zone: map.num_districts! + 1},
      {ids: [area.id], zone: 0},
      {ids: [area.id], zone: -3},
      {ids: [area.id], zone: 1.5},
      {ids: [area.id], zone: '2'},
      {ids: [area.id], zone: {x: 1}},
      {ids: area.id, zone: 1},
      {ids: [123], zone: 1},
      {ids: [], zone: 1},
      {ids: [area.id]},
    ];
    for (const input of badAssign) {
      expect(await mapTools.assignRaw(page, input), JSON.stringify(input)).toHaveProperty('error');
    }
    for (const zone of [0, -1, 1.5, 'abc', map.num_districts! + 1]) {
      expect(await mapTools.setDistrict(page, zone), String(zone)).toHaveProperty('error');
    }
    for (const tool of ['shatter', 'bogus']) {
      expect(await mapTools.setTool(page, tool), tool).toHaveProperty('error');
    }
    const state = await mapTools.state(page);
    expect(state).toMatchObject({
      assigned_feature_count: 0,
      selected_zone: 1,
      active_tool: 'brush',
    });

    // Nothing bad was buffered: a real assignment saves cleanly.
    expect(await mapTools.assign(page, [area.id], 1)).toMatchObject({assigned: 1});
    const save = page.locator('[data-testid="save-button"]');
    await save.click();
    await expect(save).toHaveAttribute('aria-label', 'All changes saved');
  });

  test('respects district locks and Forbid paint-over', async ({page}) => {
    await enableSuperDraw(page); // per-district locks are a Super Draw feature
    await page.reload();
    await waitForMapSettled(page);
    const [a, b, c] = (await mapTools.loadedAreas(page, 3)).map(x => x.id);
    await mapTools.assign(page, [a, b], 1);
    await page.getByRole('button', {name: 'Lock district 1'}).click();

    // A locked district can't be painted over, erased, or painted into.
    expect(await mapTools.assign(page, [a], 2)).toMatchObject({assigned: 0, refused: [a]});
    expect(await mapTools.assign(page, [b], null)).toMatchObject({assigned: 0, refused: [b]});
    expect(await mapTools.assign(page, [c], 1)).toEqual({error: 'District 1 is locked.'});
    expect(await assignedIn(page, 1)).toBe(2);

    await page.getByRole('button', {name: 'Unlock district 1'}).click();
    await page.getByLabel('Forbid paint-over').check();
    // Paint-over refused, painting empty areas and erasing still allowed.
    expect(await mapTools.assign(page, [a, c], 2)).toMatchObject({assigned: 1, refused: [a]});
    expect(await mapTools.assign(page, [a], null)).toMatchObject({assigned: 1, refused: []});
  });

  test('refuses to edit while painted districts are hidden (#814)', async ({page}) => {
    const [area] = await mapTools.loadedAreas(page, 1);
    // In the tabbed sidebar the visual settings live on the Map Layers tab.
    await page
      .getByRole('navigation', {name: 'Sidebar panels'})
      .getByRole('button', {name: 'Map Layers'})
      .click();
    const paintedDistricts = page.getByRole('checkbox', {name: 'Painted districts'});
    await paintedDistricts.click();
    await expect.poll(async () => (await mapTools.state(page, false)).active_tool).toBe('pan');

    expect(await mapTools.setTool(page, 'brush')).toHaveProperty('error');
    expect(await mapTools.assign(page, [area.id], 1)).toHaveProperty('error');
    // The store enforces it for every caller, hotkeys included.
    await page.locator('.maplibregl-canvas').first().hover();
    await page.keyboard.press('p');
    expect((await mapTools.state(page, false)).active_tool).toBe('pan');

    await paintedDistricts.click();
    expect(await mapTools.setTool(page, 'brush')).toEqual({active_tool: 'brush'});
  });

  test('refuses to edit while the map is locked', async ({page}) => {
    // Hold the break request so the map stays locked ("Breaking districts").
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    await page.route('**/api/gerrydb/edges/**', async route => {
      await held;
      await route.continue();
    });
    await enableSuperDraw(page);
    await page.reload();
    await waitForMapSettled(page);
    const [area] = await mapTools.loadedAreas(page, 1);
    await selectTool(page, testSelectors.shatterTool);
    const center = await getMapCenter(page);
    await page.mouse.click(center.x, center.y);
    await expect(page.locator('[data-testid="map-container"]')).toHaveClass(/pointer-events-none/);

    const busy = (await mapTools.assign(page, [area.id], 1)) as unknown as ToolError;
    expect(busy.error).toContain('busy');
    release();
    await expect(page.locator('[data-testid="map-container"]')).not.toHaveClass(
      /pointer-events-none/
    );
    // Unlocked: edits go through again (the clicked precinct may now be blocks, so
    // only check the tool no longer refuses).
    await expect.poll(async () => mapTools.assign(page, [area.id], 1)).not.toHaveProperty('error');
  });

  test('locate_area gives a point that clicks the same area', async ({page}) => {
    await selectTool(page, testSelectors.brushTool);
    await page.getByRole('checkbox', {name: 'Paint by county'}).uncheck(); // one area per click
    const box = (await page.locator('.maplibregl-canvas').first().boundingBox())!;
    const candidates = (await mapTools.loadedAreas(page, 200)).filter(a => a.zone === null);
    let painted = false;
    for (const area of candidates.slice(0, 20)) {
      const at = await mapTools.locate(page, area.id);
      if (!('visible' in at) || !at.visible) continue;
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(box.width);
      await settleAfter(page, () => page.mouse.click(box.x + at.x!, box.y + at.y!));
      const after = await mapTools.loadedAreas(page, 5000);
      expect(after.find(a => a.id === area.id)?.zone).toBe(1);
      painted = true;
      break;
    }
    expect(painted).toBe(true);
    expect(await mapTools.locate(page, 'vtd:not-a-real-id')).toHaveProperty('error');
    expect(await mapTools.locate(page, 42 as unknown as string)).toHaveProperty('error');
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
    const {document_id, public_id} = await createMapDocumentRecord(request);
    // Positive control: the same browser does get tools on the edit page.
    await navigateToMap(page, document_id);
    await skipWithoutWebMcp(page);

    await page.goto(testUrls.mapView(String(public_id)));
    await waitForMapSettled(page);
    expect(await page.webmcp.tools()).toEqual([]);
  });
});
