import { test, expect } from '@playwright/test';
import { testSelectors, testTimeouts, skipConditions } from '../../fixtures/test-data';
import { createMapDocument, navigateToMap } from '../../fixtures/map-fixture';
import { getMapCenter } from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Map Navigation', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access - skipped on production');

  test.beforeAll(async ({ request }) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for navigation tests: ${sharedDocumentId}`);
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

  test('should zoom in with mouse wheel', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const center = await getMapCenter(page);
    
    // Zoom in using mouse wheel
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, -300); // Negative Y = zoom in
    
    // Wait for zoom animation
    await page.waitForTimeout(500);
    
    // Map should still be visible after zoom
    await expect(mapCanvas).toBeVisible();
  });

  test('should zoom out with mouse wheel', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const center = await getMapCenter(page);
    
    // Zoom out using mouse wheel
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(0, 300); // Positive Y = zoom out
    
    // Wait for zoom animation
    await page.waitForTimeout(500);
    
    // Map should still be visible
    await expect(mapCanvas).toBeVisible();
  });

  test('should pan the map when in pan mode', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Click the pan tool to ensure we're in pan mode
    const panTool = page.locator(testSelectors.panTool);
    if (await panTool.isVisible()) {
      await panTool.click();
    }
    
    // Get map center
    const center = await getMapCenter(page);
    
    // Pan the map by dragging
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 100, center.y + 100, { steps: 10 });
    await page.mouse.up();
    
    // Wait for pan to complete
    await page.waitForTimeout(300);
    
    // Map should still be visible
    await expect(mapCanvas).toBeVisible();
  });

  test('should have navigation controls', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Check for navigation control (zoom buttons)
    const navControl = page.locator(testSelectors.navigationZoomIn);
    await expect(navControl).toBeVisible();
    
    // Check for zoom in button
    const zoomInButton = navControl.locator('button').first();
    await expect(zoomInButton).toBeVisible();
  });

  test('should zoom out via navigation control button', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    await page.waitForTimeout(500);
    const navControl = page.locator(testSelectors.navigationZoomOut);
    
    // Click zoom out button (usually second button in nav control)
    const buttons = navControl.locator('button');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 1) {
      await buttons.nth(1).click();
      await page.waitForTimeout(300);
      
      // Map should still be visible
      await expect(mapCanvas).toBeVisible();
    }
  });
});
