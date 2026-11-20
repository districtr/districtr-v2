import {test, expect} from '@playwright/test';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocument,
  navigateToMap,
  settleAfter,
  selectTool,
} from '../../fixtures/map-fixture';
import {getMapCenter, paintAtCoordinates} from '../../utils/map-helpers';
import {mapTools, skipWithoutWebMcp} from '../../utils/webmcp';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Save Map', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, sharedDocumentId!);
  });

  test('marks the map unsaved after painting, saved after clicking save', async ({page}) => {
    await selectTool(page, testSelectors.brushTool);
    const center = await getMapCenter(page);
    await settleAfter(page, () => paintAtCoordinates(page, center.x, center.y));

    const saveButton = page.locator('[data-testid="save-button"]');
    await expect(saveButton).toHaveAttribute('aria-label', 'Save changes');
    await saveButton.click();
    await expect(saveButton).toHaveAttribute('aria-label', 'All changes saved');
  });

  test('saved changes load in a fresh browser (server, not IndexedDB)', async ({page, browser}) => {
    await skipWithoutWebMcp(page);
    await selectTool(page, testSelectors.brushTool);
    const center = await getMapCenter(page);
    await settleAfter(page, () => paintAtCoordinates(page, center.x - 40, center.y));
    const saveButton = page.locator('[data-testid="save-button"]');
    await saveButton.click();
    await expect(saveButton).toHaveAttribute('aria-label', 'All changes saved');
    const saved = (await mapTools.state(page)).assigned_feature_count;
    expect(saved).toBeGreaterThan(0);

    const fresh = await (
      await browser.newContext({viewport: {width: 1280, height: 720}})
    ).newPage();
    await navigateToMap(fresh, sharedDocumentId!);
    await expect.poll(async () => (await mapTools.state(fresh)).assigned_feature_count).toBe(saved);
    await fresh.context().close();
  });
});
