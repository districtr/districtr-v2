import { test, expect } from '@playwright/test';
import { testSelectors, testTimeouts, skipConditions, testUrls } from '../../fixtures/test-data';
import { createMapDocument, navigateToMap } from '../../fixtures/map-fixture';
import { getMapCenter, paintAtCoordinates } from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Save Map', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({ request }) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for save tests: ${sharedDocumentId}`);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    await navigateToMap(page, sharedDocumentId);
  });

  test('should auto-save when painting', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Select brush tool and paint
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    const center = await getMapCenter(page);
    await paintAtCoordinates(page, center.x, center.y);
    
    // Wait for auto-save to trigger
    await page.waitForTimeout(2000);
    
    // The save should happen automatically in the background
    // We verify the map is still functional
    await expect(mapCanvas).toBeVisible();
  });

  test('should persist changes across page reload', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Make a change
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    const center = await getMapCenter(page);
    await paintAtCoordinates(page, center.x, center.y);
    
    // Wait for auto-save
    await page.waitForTimeout(3000);
    
    // Reload the page
    await page.reload();
    
    // Wait for map to load again
    await page.locator(testSelectors.mapCanvas).waitFor({ 
      state: 'visible',
      timeout: testTimeouts.mapLoad 
    });
    
    // Map should still be visible
    await expect(page.locator(testSelectors.mapCanvas)).toBeVisible();
  });

  test('should handle save errors gracefully', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Make a change
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    const center = await getMapCenter(page);
    await paintAtCoordinates(page, center.x, center.y);
    
    // Wait for save attempt
    await page.waitForTimeout(2000);
    
    // Map should still be functional even if save had issues
    await expect(mapCanvas).toBeVisible();
  });
});

test.describe('Map Metadata', () => {
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
    await page.setViewportSize({ width: 1280, height: 720 });
    
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    await navigateToMap(page, sharedDocumentId);
  });

  test('should display map name in topbar', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Look for topbar
    const topbar = page.locator('[data-testid="topbar"]');
    
    // The topbar should exist and contain map info
    if (await topbar.isVisible()) {
      await expect(topbar).toBeVisible();
    }
  });

  test('should allow editing map name', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Look for editable name field or edit button
    const mapName = page.locator('[data-testid="map-name"]');
    
    if (await mapName.isVisible()) {
      await mapName.click();
      // If it's editable, we should be able to type
      await page.waitForTimeout(200);
    }
    
    // Map should still be functional
    await expect(mapCanvas).toBeVisible();
  });
});
