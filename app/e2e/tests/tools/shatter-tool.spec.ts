import {test, expect} from '@playwright/test';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocument,
  navigateToMap,
  getRegionScreenshot,
  settleAfter,
  selectTool,
  enableSuperDraw,
} from '../../fixtures/map-fixture';
import {getMapCenter, paintAtCoordinates} from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Shatter Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    // The shatter tool is only rendered in Super Draw; seed the persisted
    // toolbar store so a fresh browser context shows it.
    await enableSuperDraw(page);
    await navigateToMap(page, sharedDocumentId!);
  });

  test('should select the shatter tool when clicked', async ({page}) => {
    const shatterTool = page.locator(testSelectors.shatterTool);
    await shatterTool.click();
    await expect(shatterTool).toHaveAttribute('aria-pressed', 'true');
  });

  test('should shatter a painted area when clicked', async ({page}) => {
    const center = await getMapCenter(page);
    await selectTool(page, testSelectors.brushTool);
    await settleAfter(page, () => paintAtCoordinates(page, center.x, center.y));
    const painted = await getRegionScreenshot(page, center.x, center.y, 100);

    await selectTool(page, testSelectors.shatterTool);
    // Shattering draws the precinct's block outlines.
    await settleAfter(page, () => page.mouse.click(center.x, center.y));
    const shattered = await getRegionScreenshot(page, center.x, center.y, 100);
    expect(shattered.equals(painted)).toBe(false);
  });
});
