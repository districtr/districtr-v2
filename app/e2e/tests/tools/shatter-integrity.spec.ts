import {test, expect, type Page, type APIRequestContext} from '@playwright/test';
import {encode} from '@msgpack/msgpack';
import {testSelectors, testConfig, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocument,
  navigateToMap,
  settleAfter,
  selectTool,
  enableSuperDraw,
} from '../../fixtures/map-fixture';
import {getMapCenter, paintAtCoordinates} from '../../utils/map-helpers';
import {mapTools, assignedIn, skipWithoutWebMcp, type Area} from '../../utils/webmcp';

/**
 * Breaking a precinct into blocks ("shatter") and the integrity of what gets saved:
 * blocks survive a save, a map saved both whole and as blocks raises the repair
 * modal (#792), and a failed break releases the map lock (#807).
 */

const REPAIR_TITLE = "Something went wrong with this map's assignments";

/** The shatter tool only renders in Super Draw; seed the persisted toolbar store. */
/** Loaded blocks of broken precincts, sorted for comparison. */
async function loadedBlocks(page: Page): Promise<Area[]> {
  const areas = await mapTools.loadedAreas(page, 5000);
  return areas.filter(a => a.parent).sort((a, b) => a.id.localeCompare(b.id));
}

/** Paint the precinct (county, with the default paint-by-county) at the map center, then break it. */
async function paintAndShatterCenter(page: Page): Promise<Area[]> {
  const c = await getMapCenter(page);
  await selectTool(page, testSelectors.brushTool);
  await settleAfter(page, () => paintAtCoordinates(page, c.x, c.y));
  await selectTool(page, testSelectors.shatterTool);
  await settleAfter(page, () => page.mouse.click(c.x, c.y));
  await expect.poll(async () => (await loadedBlocks(page)).length).toBeGreaterThan(0);
  return loadedBlocks(page);
}

async function save(page: Page) {
  const saveButton = page.locator('[data-testid="save-button"]');
  await expect(saveButton).toHaveAttribute('aria-label', 'Save changes');
  await saveButton.click();
  await expect(saveButton).toHaveAttribute('aria-label', 'All changes saved');
}

/** Block paths of a precinct, from the backend graph. */
async function blocksOf(request: APIRequestContext, parent: string): Promise<string[]> {
  const response = await request.get(
    `${testConfig.backendURL}/api/gerrydb/edges/${testConfig.testMapSlug}`,
    {params: {parent_geoid: parent}}
  );
  expect(response.ok()).toBe(true);
  const edges: {parent_path: string; child_path: string}[] = await response.json();
  return edges.map(e => e.child_path);
}

let sharedDocumentId: string | null = null;

test.describe('Shatter integrity', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test('broken precincts and their block assignments survive a save', async ({
    page,
    browser,
    request,
  }) => {
    const documentId = await createMapDocument(request);
    await enableSuperDraw(page);
    await navigateToMap(page, documentId);
    await skipWithoutWebMcp(page);

    const blocks = await paintAndShatterCenter(page);
    const moved = blocks.slice(0, 5).map(b => b.id);
    expect(await mapTools.assign(page, moved, 2)).toMatchObject({assigned: moved.length});
    await expect.poll(() => assignedIn(page, 2)).toBe(moved.length);
    await save(page);
    const savedBlocks = await loadedBlocks(page);
    const savedSummary = await mapTools.districts(page);

    const context = await browser.newContext();
    const fresh = await context.newPage();
    await navigateToMap(fresh, documentId);
    // Counts and populations per district cover every block, loaded or not.
    await expect.poll(() => mapTools.districts(fresh)).toEqual(savedSummary);
    // Which block tiles load depends on the viewport, so check the loaded ones agree.
    const savedZone = new Map(savedBlocks.map(b => [b.id, b.zone]));
    const freshBlocks = await loadedBlocks(fresh);
    expect(freshBlocks.length).toBeGreaterThan(0);
    for (const block of freshBlocks) expect(block.zone).toBe(savedZone.get(block.id));
    // A cleanly broken precinct is not flagged for repair.
    await expect(fresh.getByRole('dialog', {name: REPAIR_TITLE})).toHaveCount(0);
    await expect(fresh.getByRole('alert').filter({hasText: 'Something went wrong'})).toHaveCount(0);
    await context.close();
  });

  test('a precinct saved both whole and as blocks opens the repair modal, and Fix repairs it', async ({
    page,
    browser,
    request,
  }) => {
    const documentId = await createMapDocument(request);
    await navigateToMap(page, documentId);
    await skipWithoutWebMcp(page);
    const parent = (await mapTools.loadedAreas(page, 50)).find(a => !a.parent)!.id;
    const blocks = await blocksOf(request, parent);
    expect(blocks.length).toBeGreaterThan(1);

    // Serve the saved state #792 repairs: the precinct's own assignment plus its blocks'.
    const context = await browser.newContext();
    const corrupt = await context.newPage();
    await corrupt.route('**/api/get_assignments/**', async route => {
      const response = await route.fetch();
      const rows = [[parent, 1, null], ...blocks.map(block => [block, 2, parent])];
      await route.fulfill({response, body: Buffer.from(encode(rows))});
    });
    await corrupt.goto(`/map/${documentId}/edit`);
    const modal = corrupt.getByRole('dialog', {name: REPAIR_TITLE});
    await expect(modal).toBeVisible({timeout: 45_000});

    // The blocks carry an assignment, so "Keep blocks" is the suggested fix.
    await modal.getByRole('button', {name: 'Fix and save'}).click();
    await expect(modal).toBeHidden();
    await corrupt.unroute('**/api/get_assignments/**');
    await expect.poll(() => assignedIn(corrupt, 2)).toBe(blocks.length);
    expect(await assignedIn(corrupt, 1)).toBe(0);
    await context.close();

    // The repaired state reached the server: a clean load elsewhere, no modal. (A new
    // context: the first tab's IndexedDB copy now conflicts with the repaired save.)
    const verifyContext = await browser.newContext();
    const verify = await verifyContext.newPage();
    await navigateToMap(verify, documentId);
    await expect.poll(() => assignedIn(verify, 2)).toBe(blocks.length);
    expect(await assignedIn(verify, 1)).toBe(0);
    await expect(verify.getByRole('dialog', {name: REPAIR_TITLE})).toHaveCount(0);
    await verifyContext.close();
  });

  test('a failed break releases the map lock and leaves the map paintable (#807)', async ({
    page,
  }) => {
    await enableSuperDraw(page);
    await navigateToMap(page, sharedDocumentId!);
    await skipWithoutWebMcp(page);

    // Hold the edges request until the lock is observed, then fail it.
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/api/gerrydb/edges/**', async route => {
      await gate;
      await route.abort();
    });

    const container = page.locator('[data-testid="map-container"]').first();
    const c = await getMapCenter(page);
    await selectTool(page, testSelectors.shatterTool);
    await page.mouse.click(c.x, c.y);
    await expect(container).toHaveClass(/pointer-events-none/);
    release();

    // Scoped to the toast region: Radix also mirrors the text into an aria-live status.
    await expect(
      page.getByRole('region', {name: /Notifications/}).getByText('Breaking this geography failed')
    ).toBeVisible();
    await expect(container).not.toHaveClass(/pointer-events-none/);
    await page.unroute('**/api/gerrydb/edges/**');

    await selectTool(page, testSelectors.brushTool);
    const before = (await mapTools.state(page)).assigned_feature_count;
    await settleAfter(page, () => paintAtCoordinates(page, c.x + 30, c.y + 30));
    await expect
      .poll(async () => (await mapTools.state(page)).assigned_feature_count)
      .toBeGreaterThan(before);
  });
});
