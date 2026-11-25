import {test, expect, type Page} from '@playwright/test';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocument,
  navigateToMap,
  settleAfter,
  selectTool,
} from '../../fixtures/map-fixture';
import {getMapCenter, paintAtCoordinates} from '../../utils/map-helpers';
import {mapTools, assignedIn, skipWithoutWebMcp} from '../../utils/webmcp';

const redoTool = '[data-testid="redo-tool"]';
const assignedCount = async (page: Page) => (await mapTools.state(page)).assigned_feature_count;

/** Mouse-paint the map center into district 1; returns the zone-1 count before and after. */
async function paintCenter(page: Page): Promise<{before: number; after: number}> {
  await selectTool(page, testSelectors.brushTool);
  const before = await assignedIn(page, 1);
  const center = await getMapCenter(page);
  await settleAfter(page, () => paintAtCoordinates(page, center.x, center.y));
  await expect.poll(() => assignedIn(page, 1)).toBeGreaterThan(before);
  return {before, after: await assignedIn(page, 1)};
}

test.describe('Undo and redo', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  // Each test paints the same spot, so each gets its own document.
  test.beforeEach(async ({page, request}) => {
    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, await createMapDocument(request));
    await skipWithoutWebMcp(page);
  });

  test('toolbar buttons undo and redo a mouse paint', async ({page}) => {
    const {before, after} = await paintCenter(page);

    await page.locator(testSelectors.undoTool).click();
    await expect.poll(() => assignedIn(page, 1)).toBe(before);
    await expect(page.locator(redoTool)).toBeEnabled();

    await page.locator(redoTool).click();
    await expect.poll(() => assignedIn(page, 1)).toBe(after);
  });

  test('keyboard shortcuts undo and redo a mouse paint', async ({page}) => {
    const {before, after} = await paintCenter(page);

    await page.keyboard.press('ControlOrMeta+KeyZ');
    await expect.poll(() => assignedIn(page, 1)).toBe(before);

    await page.keyboard.press('ControlOrMeta+Shift+KeyZ');
    await expect.poll(() => assignedIn(page, 1)).toBe(after);
  });
});

test.describe('Reset map', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  // Destructive: each test gets its own document.
  let documentId: string;
  test.beforeEach(async ({page, request}) => {
    documentId = await createMapDocument(request);
    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, documentId);
    await skipWithoutWebMcp(page);
  });

  /** Assign 5 areas, mouse-paint one more history step, save, then reset. */
  async function paintSaveAndReset(page: Page) {
    const areas = await mapTools.loadedAreas(page, 10);
    await mapTools.assign(
      page,
      areas.slice(0, 5).map(a => a.id),
      1
    );
    await paintCenter(page);
    const saveButton = page.locator('[data-testid="save-button"]');
    await saveButton.click();
    await expect(saveButton).toHaveAttribute('aria-label', 'All changes saved');
    expect(await assignedCount(page)).toBeGreaterThan(5);

    await page.locator('[data-testid="map-actions-trigger"]').click();
    // Hover doesn't open the Radix submenu reliably; the keyboard does.
    await page.getByRole('menuitem', {name: 'Reset map'}).press('ArrowRight');
    await page.getByRole('menu').last().getByRole('menuitem', {name: 'Reset map'}).click();
    await expect.poll(() => assignedCount(page)).toBe(0);
  }

  test('clears every assignment, on the server too', async ({page, browser}) => {
    await paintSaveAndReset(page);
    const districts = await mapTools.districts(page);
    expect(districts.filter(d => d.zone !== null).every(d => d.population === 0)).toBe(true);
    // Reset is a server call, so the map is already in sync, and it drops back to pan.
    await expect(page.locator('[data-testid="save-button"]')).toHaveAttribute(
      'aria-label',
      'All changes saved'
    );
    await expect(page.locator(testSelectors.panTool)).toHaveAttribute('aria-pressed', 'true');

    const fresh = await (
      await browser.newContext({viewport: {width: 1280, height: 720}})
    ).newPage();
    await navigateToMap(fresh, documentId);
    expect(await assignedCount(fresh)).toBe(0);
    await fresh.context().close();
  });

  // fixme: reset leaves the undo history in place; undo restores pre-reset assignments and a
  // save writes them back to the server, despite "Resetting your map cannot be undone".
  test.fixme('cannot be undone', async ({page}) => {
    await paintSaveAndReset(page);
    await expect(page.locator(testSelectors.undoTool)).toBeDisabled();
    await page.locator(testSelectors.undoTool).click({force: true});
    await expect.poll(() => assignedCount(page)).toBe(0);
  });
});
