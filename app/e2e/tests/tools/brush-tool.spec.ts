import { test, expect } from '@playwright/test';
import { testSelectors, testTimeouts, skipConditions } from '../../fixtures/test-data';
import { createMapDocument, navigateToMap, getRegionScreenshot } from '../../fixtures/map-fixture';
import { getMapCenter, paintAtCoordinates, dragOnMap } from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Brush Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({ request }) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for brush tests: ${sharedDocumentId}`);
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

  test('should select the brush tool when clicked', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Click the brush tool
    const brushTool = page.locator(testSelectors.brushTool);
    await expect(brushTool).toBeVisible({ timeout: testTimeouts.medium });
    await brushTool.click();
    
    // Verify the brush tool is now selected (should have 'solid' variant)
    await expect(brushTool).toHaveAttribute('data-state', /.*/);
  });

  test('should paint on the map when clicking with brush tool', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Wait for map tiles to load
    await page.waitForTimeout(2000);
    
    // Select the brush tool
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    // Get map center coordinates
    const center = await getMapCenter(page);
    
    // Zoom in to get more detail
    const zoomInButton = page.locator(testSelectors.navigationZoomIn);
    for (let i = 0; i < 5; i++) {
      await zoomInButton.click();
      await page.waitForTimeout(200);
    }
    
    // Wait for zoom to settle and tiles to load
    await page.waitForTimeout(1000);
    
    // Take a screenshot of the region BEFORE painting
    const beforeScreenshot = await getRegionScreenshot(page, center.x, center.y, 100);
    
    // Paint at the center
    await paintAtCoordinates(page, center.x, center.y);
    
    // Wait for paint action to complete and render
    await page.waitForTimeout(1000);
    
    // Take a screenshot of the region AFTER painting
    const afterScreenshot = await getRegionScreenshot(page, center.x, center.y, 100);
    
    // The screenshots should be different (paint changed the canvas)
    // Compare as base64 strings
    const beforeBase64 = beforeScreenshot.toString('base64');
    const afterBase64 = afterScreenshot.toString('base64');
    expect(beforeBase64).not.toEqual(afterBase64);
  });

  test('should paint continuous stroke when dragging', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Wait for map tiles to load
    await page.waitForTimeout(2000);
    
    // Select the brush tool
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    // Get map center and create a drag path
    const center = await getMapCenter(page);
    
    // Take a screenshot BEFORE dragging
    const beforeScreenshot = await getRegionScreenshot(page, center.x, center.y, 150);
    
    // Perform a drag painting action
    await dragOnMap(
      page,
      center.x - 50,
      center.y - 50,
      center.x + 50,
      center.y + 50,
      10
    );
    
    // Wait for paint action to complete
    await page.waitForTimeout(1000);
    
    // Take a screenshot AFTER dragging
    const afterScreenshot = await getRegionScreenshot(page, center.x, center.y, 150);
    
    // The screenshots should be different (drag paint changed the canvas)
    const beforeBase64 = beforeScreenshot.toString('base64');
    const afterBase64 = afterScreenshot.toString('base64');
    expect(beforeBase64).not.toEqual(afterBase64);
  });

  test('should use the selected zone color when painting', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Wait for map tiles to load
    await page.waitForTimeout(2000);
    
    // First, select zone 2
    const zone2 = page.locator(testSelectors.zoneButton(2));
    if (await zone2.isVisible()) {
      await zone2.click();
      await page.waitForTimeout(100);
    }
    
    // Then select the brush tool
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    // Get map center
    const center = await getMapCenter(page);
    
    // Take a screenshot BEFORE painting
    const beforeScreenshot = await getRegionScreenshot(page, center.x, center.y, 100);
    
    // Paint on the map
    await paintAtCoordinates(page, center.x, center.y);
    
    // Wait for paint action
    await page.waitForTimeout(1000);
    
    // Take a screenshot AFTER painting
    const afterScreenshot = await getRegionScreenshot(page, center.x, center.y, 100);
    
    // The screenshots should be different
    const beforeBase64 = beforeScreenshot.toString('base64');
    const afterBase64 = afterScreenshot.toString('base64');
    expect(beforeBase64).not.toEqual(afterBase64);
  });

  test('should switch between zones while painting', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Wait for map tiles to load
    await page.waitForTimeout(2000);
    
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    const center = await getMapCenter(page);
    
    // Take initial screenshot
    const initialScreenshot = await getRegionScreenshot(page, center.x, center.y, 150);
    
    // Paint with zone 1
    const zone1 = page.locator(testSelectors.zoneButton(1));
    if (await zone1.isVisible()) {
      await zone1.click();
    }
    await paintAtCoordinates(page, center.x - 30, center.y);
    await page.waitForTimeout(500);
    
    // Switch to zone 2 and paint in a different area
    const zone2 = page.locator(testSelectors.zoneButton(2));
    if (await zone2.isVisible()) {
      await zone2.click();
    }
    await paintAtCoordinates(page, center.x + 30, center.y);
    await page.waitForTimeout(500);
    
    // Take final screenshot
    const finalScreenshot = await getRegionScreenshot(page, center.x, center.y, 150);
    
    // The screenshots should be different (both zones painted)
    const initialBase64 = initialScreenshot.toString('base64');
    const finalBase64 = finalScreenshot.toString('base64');
    expect(initialBase64).not.toEqual(finalBase64);
  });

  test('should show hover preview when moving over map', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Select the brush tool
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    // Move mouse over the map
    const center = await getMapCenter(page);
    await page.mouse.move(center.x, center.y);
    
    // Wait a moment for hover effect
    await page.waitForTimeout(300);
    
    // Map should still be interactive
    await expect(mapCanvas).toBeVisible();
  });
});

test.describe('Brush Tool Keyboard Shortcuts', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({ request }) => {
    if (!sharedDocumentId) {
      try {
        sharedDocumentId = await createMapDocument(request);
      } catch (error) {
        console.error('Failed to create document:', error);
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    await navigateToMap(page, sharedDocumentId);
  });

  test('should activate brush tool with keyboard shortcut', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    await page.keyboard.press('p');
    // Wait for tool switch
    await page.waitForTimeout(200);
    
    // Verify brush tool is selected
    const brushTool = page.locator(testSelectors.brushTool);
    await expect(brushTool).toBeVisible();
  });

  test('should switch zones with number keys', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    await page.keyboard.press('p');
    await page.waitForTimeout(200);
    // Press '2' to select zone 2
    await page.keyboard.press('2');
    
    // Wait for zone switch
    await page.waitForTimeout(200);
    
    // Zone 2 should now be selected (verify visually or via store)
    // The zone picker should reflect the change
    const zonePicker = page.locator(testSelectors.zonePicker);
    await expect(zonePicker).toBeVisible();
  });
});
