import {test, expect} from '@playwright/test';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocument,
  navigateToMap,
  getRegionScreenshot,
  settleAfter,
  selectTool,
} from '../../fixtures/map-fixture';
import {getMapCenter, paintAtCoordinates, dragOnMap} from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Eraser Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await navigateToMap(page, sharedDocumentId!);
  });

  test('should select the eraser tool when clicked', async ({page}) => {
    const eraserTool = page.locator(testSelectors.eraserTool);
    await eraserTool.click();
    await expect(eraserTool).toHaveAttribute('aria-pressed', 'true');
  });

  test('should erase painted areas when clicking', async ({page}) => {
    const center = await getMapCenter(page);
    const initial = await getRegionScreenshot(page, center.x, center.y, 100);

    await selectTool(page, testSelectors.brushTool);
    await settleAfter(page, () => paintAtCoordinates(page, center.x, center.y));
    const afterPaint = await getRegionScreenshot(page, center.x, center.y, 100);
    expect(afterPaint.equals(initial)).toBe(false);

    await selectTool(page, testSelectors.eraserTool);
    await settleAfter(page, () => paintAtCoordinates(page, center.x, center.y));
    const afterErase = await getRegionScreenshot(page, center.x, center.y, 100);
    expect(afterErase.equals(afterPaint)).toBe(false);
  });

  test('should erase continuous area when dragging', async ({page}) => {
    const center = await getMapCenter(page);
    const stroke = () => dragOnMap(page, center.x - 50, center.y, center.x + 50, center.y, 10);
    const initial = await getRegionScreenshot(page, center.x, center.y, 150);

    await selectTool(page, testSelectors.brushTool);
    await settleAfter(page, stroke);
    const afterPaint = await getRegionScreenshot(page, center.x, center.y, 150);
    expect(afterPaint.equals(initial)).toBe(false);

    await selectTool(page, testSelectors.eraserTool);
    await settleAfter(page, stroke);
    const afterErase = await getRegionScreenshot(page, center.x, center.y, 150);
    expect(afterErase.equals(afterPaint)).toBe(false);
  });

  test('should activate eraser tool with keyboard shortcut', async ({page}) => {
    await page.keyboard.press('e');
    await expect(page.locator(testSelectors.eraserTool)).toHaveAttribute('aria-pressed', 'true');
  });
});
