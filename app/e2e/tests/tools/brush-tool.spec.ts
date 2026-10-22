import {test, expect} from '@playwright/test';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocument,
  navigateToMap,
  settleAfter,
  selectTool,
} from '../../fixtures/map-fixture';
import {getMapCenter, paintAtCoordinates, dragOnMap} from '../../utils/map-helpers';
import {mapTools, assignedIn, skipWithoutWebMcp} from '../../utils/webmcp';

/**
 * WebMCP-backed spec: gestures still go through the real mouse, but setup and
 * assertions read map state through the page's WebMCP tools instead of
 * screenshot diffs and fixed sleeps. Deltas, not absolutes: tests in a worker
 * share one document.
 */

let sharedDocumentId: string | null = null;

test.describe('Brush Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await navigateToMap(page, sharedDocumentId!);
    await skipWithoutWebMcp(page);
  });

  test('selects the brush tool when clicked', async ({page}) => {
    await page.keyboard.press('m'); // new maps open with the brush already active
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    await expect(brushTool).toHaveAttribute('aria-pressed', 'true');
    expect((await mapTools.state(page, false)).active_tool).toBe('brush');
  });

  test('click-paints an area into the selected district', async ({page}) => {
    await selectTool(page, testSelectors.brushTool);
    const before = await assignedIn(page, 1);
    const center = await getMapCenter(page);
    await settleAfter(page, () => paintAtCoordinates(page, center.x, center.y));
    expect(await assignedIn(page, 1)).toBeGreaterThan(before);
  });

  test('paints a continuous stroke when dragging', async ({page}) => {
    await selectTool(page, testSelectors.brushTool);
    const before = (await mapTools.state(page)).assigned_feature_count;
    const c = await getMapCenter(page);
    await settleAfter(page, () => dragOnMap(page, c.x - 60, c.y - 60, c.x + 60, c.y + 60, 15));
    expect((await mapTools.state(page)).assigned_feature_count).toBeGreaterThan(before + 1);
  });

  test('paints with the district picked in the zone picker', async ({page}) => {
    await page.locator(testSelectors.zoneButton(2)).click();
    await selectTool(page, testSelectors.brushTool);
    expect((await mapTools.state(page, false)).selected_zone).toBe(2);
    const before = await assignedIn(page, 2);
    const c = await getMapCenter(page);
    await settleAfter(page, () => paintAtCoordinates(page, c.x + 40, c.y + 40));
    expect(await assignedIn(page, 2)).toBeGreaterThan(before);
  });

  test('assign_areas paints by GEOID and undo reverts it', async ({page}) => {
    const area = (await mapTools.loadedAreas(page, 500)).find(a => a.zone === null);
    test.skip(!area, 'No unassigned area loaded');
    const before = await assignedIn(page, 3);
    const result = await mapTools.assign(page, [area!.id], 3);
    expect(result).toEqual({assigned: 1, unchanged: 0, not_shattered: [], not_loaded: []});
    // Ingest into the store is async (worker round-trip).
    await expect.poll(() => assignedIn(page, 3)).toBe(before + 1);

    await page.locator(testSelectors.undoTool).click();
    await expect.poll(() => assignedIn(page, 3)).toBe(before);
  });
});

test.describe('Brush Tool Keyboard Shortcuts', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId ??= await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await navigateToMap(page, sharedDocumentId!);
  });

  test('P activates the brush tool', async ({page}) => {
    await page.keyboard.press('m');
    await page.keyboard.press('p');
    await expect(page.locator(testSelectors.brushTool)).toHaveAttribute('aria-pressed', 'true');
  });

  test('number keys switch districts', async ({page}) => {
    await page.keyboard.press('p');
    await page.keyboard.press('2');
    await expect(page.locator(testSelectors.zoneButton(2))).toHaveAttribute(
      'data-state',
      'checked'
    );
  });
});
