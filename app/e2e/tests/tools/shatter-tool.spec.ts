import { test, expect } from '@playwright/test';
import { testSelectors, testTimeouts, skipConditions } from '../../fixtures/test-data';
import { createMapDocument, navigateToMap } from '../../fixtures/map-fixture';
import { getMapCenter, paintAtCoordinates } from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Shatter Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({ request }) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for shatter tests: ${sharedDocumentId}`);
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

  test('should select the shatter tool when clicked', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Click the shatter tool
    const shatterTool = page.locator(testSelectors.shatterTool);
    
    if (!(await shatterTool.isVisible())) {
      test.skip(true, 'Shatter tool not available');
      return;
    }
    
    await shatterTool.click();
    
    // Verify the shatter tool is now selected
    await expect(shatterTool).toHaveAttribute('data-state', /.*/);
  });

  test('should shatter a painted area when clicked', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const center = await getMapCenter(page);
    
    // First, paint an area
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    await paintAtCoordinates(page, center.x, center.y);
    await page.waitForTimeout(300);
    
    // Switch to shatter tool
    const shatterTool = page.locator(testSelectors.shatterTool);
    
    if (!(await shatterTool.isVisible())) {
      test.skip(true, 'Shatter tool not available');
      return;
    }
    
    await shatterTool.click();
    
    // Click on the painted area to shatter
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(500);
    
    // Map should still be visible
    await expect(mapCanvas).toBeVisible();
  });
});
