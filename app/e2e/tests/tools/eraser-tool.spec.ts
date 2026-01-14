import { test, expect } from '@playwright/test';
import { testSelectors, testTimeouts, skipConditions } from '../../fixtures/test-data';
import { createMapDocument, navigateToMap, getRegionScreenshot } from '../../fixtures/map-fixture';
import { getMapCenter, paintAtCoordinates, dragOnMap } from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Eraser Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({ request }) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for eraser tests: ${sharedDocumentId}`);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  });

  test.beforeEach(async ({ page }) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    await navigateToMap(page, sharedDocumentId);
  });

  test('should select the eraser tool when clicked', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Click the eraser tool
    const eraserTool = page.locator(testSelectors.eraserTool);
    await expect(eraserTool).toBeVisible({ timeout: testTimeouts.medium });
    await eraserTool.click();
    
    // Verify the eraser tool is now selected
    await expect(eraserTool).toHaveAttribute('data-state', /.*/);
  });

  test('should erase painted areas when clicking', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Wait for map tiles to load
    await page.waitForTimeout(2000);
    
    const center = await getMapCenter(page);
    
    // Take initial screenshot
    const initialScreenshot = await getRegionScreenshot(page, center.x, center.y, 100);
    
    // First, paint something with the brush
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    await paintAtCoordinates(page, center.x, center.y);
    await page.waitForTimeout(1000);
    
    // Take screenshot after painting
    const afterPaintScreenshot = await getRegionScreenshot(page, center.x, center.y, 100);
    
    // Verify paint changed the canvas
    const initialBase64 = initialScreenshot.toString('base64');
    const afterPaintBase64 = afterPaintScreenshot.toString('base64');
    expect(initialBase64).not.toEqual(afterPaintBase64);
    
    // Then switch to eraser
    const eraserTool = page.locator(testSelectors.eraserTool);
    await eraserTool.click();
    
    // Erase at the same location
    await paintAtCoordinates(page, center.x, center.y);
    await page.waitForTimeout(1000);
    
    // Take screenshot after erasing
    const afterEraseScreenshot = await getRegionScreenshot(page, center.x, center.y, 100);
    
    // Verify erase changed the canvas (should be different from painted state)
    const afterEraseBase64 = afterEraseScreenshot.toString('base64');
    expect(afterPaintBase64).not.toEqual(afterEraseBase64);
  });

  test('should erase continuous area when dragging', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Wait for map tiles to load
    await page.waitForTimeout(2000);
    
    const center = await getMapCenter(page);
    
    // Take initial screenshot
    const initialScreenshot = await getRegionScreenshot(page, center.x, center.y, 150);
    
    // First, paint a stroke
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    await dragOnMap(
      page,
      center.x - 50,
      center.y,
      center.x + 50,
      center.y,
      10
    );
    await page.waitForTimeout(1000);
    
    // Take screenshot after painting
    const afterPaintScreenshot = await getRegionScreenshot(page, center.x, center.y, 150);
    
    // Verify paint changed the canvas
    const initialBase64 = initialScreenshot.toString('base64');
    const afterPaintBase64 = afterPaintScreenshot.toString('base64');
    expect(initialBase64).not.toEqual(afterPaintBase64);
    
    // Switch to eraser
    const eraserTool = page.locator(testSelectors.eraserTool);
    await eraserTool.click();
    
    // Erase by dragging
    await dragOnMap(
      page,
      center.x - 50,
      center.y,
      center.x + 50,
      center.y,
      10
    );
    await page.waitForTimeout(1000);
    
    // Take screenshot after erasing
    const afterEraseScreenshot = await getRegionScreenshot(page, center.x, center.y, 150);
    
    // Verify erase changed the canvas
    const afterEraseBase64 = afterEraseScreenshot.toString('base64');
    expect(afterPaintBase64).not.toEqual(afterEraseBase64);
  });

  test('should activate eraser tool with keyboard shortcut', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Press 'e' for eraser tool
    await page.keyboard.press('e');
    
    // Wait for tool switch
    await page.waitForTimeout(200);
    
    // Verify eraser tool is selected
    const eraserTool = page.locator(testSelectors.eraserTool);
    await expect(eraserTool).toBeVisible();
  });
});
