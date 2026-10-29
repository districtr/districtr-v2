import {test, expect} from '@playwright/test';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocument,
  navigateToMap,
  getRegionScreenshot,
  settleAfter,
  selectTool,
} from '../../fixtures/map-fixture';
import {getMapCenter, dragOnMap} from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Pan Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await navigateToMap(page, sharedDocumentId!);
  });

  test('should select the pan tool when clicked', async ({page}) => {
    await page.keyboard.press('p'); // start from another tool
    await page.locator(testSelectors.panTool).click();
    await expect(page.locator(testSelectors.panTool)).toHaveAttribute('aria-pressed', 'true');
  });

  test('should pan the map when dragging with pan tool', async ({page}) => {
    await selectTool(page, testSelectors.panTool);
    const center = await getMapCenter(page);
    const before = await getRegionScreenshot(page, center.x, center.y, 200);
    await settleAfter(page, () =>
      dragOnMap(page, center.x, center.y, center.x + 100, center.y + 100, 10)
    );
    const after = await getRegionScreenshot(page, center.x, center.y, 200);
    expect(after.equals(before)).toBe(false);
  });

  test('should activate pan tool with keyboard shortcut', async ({page}) => {
    await page.keyboard.press('p');
    await expect(page.locator(testSelectors.brushTool)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('m');
    await expect(page.locator(testSelectors.panTool)).toHaveAttribute('aria-pressed', 'true');
  });
});
