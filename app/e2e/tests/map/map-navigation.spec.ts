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

test.describe('Map Navigation', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access - skipped on production');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await navigateToMap(page, sharedDocumentId!);
  });

  /** Run a view change and assert the map around the center redrew. */
  async function expectViewChange(
    page: import('@playwright/test').Page,
    action: () => Promise<unknown>
  ) {
    const center = await getMapCenter(page);
    const before = await getRegionScreenshot(page, center.x, center.y, 200);
    await settleAfter(page, action);
    const after = await getRegionScreenshot(page, center.x, center.y, 200);
    expect(after.equals(before)).toBe(false);
  }

  test('should zoom in with mouse wheel', async ({page}) => {
    const center = await getMapCenter(page);
    await page.mouse.move(center.x, center.y);
    await expectViewChange(page, () => page.mouse.wheel(0, -300));
  });

  test('should zoom out with mouse wheel', async ({page}) => {
    const center = await getMapCenter(page);
    await page.mouse.move(center.x, center.y);
    await expectViewChange(page, () => page.mouse.wheel(0, 300));
  });

  test('should pan the map when in pan mode', async ({page}) => {
    await selectTool(page, testSelectors.panTool);
    const c = await getMapCenter(page);
    await expectViewChange(page, () => dragOnMap(page, c.x, c.y, c.x + 100, c.y + 100, 10));
  });

  test('should zoom out via navigation control button', async ({page}) => {
    await expectViewChange(page, () => page.locator(testSelectors.navigationZoomOut).click());
  });
});
