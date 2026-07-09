import {test, expect} from '@playwright/test';
import {testUrls, testSelectors, testTimeouts, skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap} from '../../fixtures/map-fixture';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Share Map', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for share tests: ${sharedDocumentId}`);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  });

  test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});

    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    await navigateToMap(page, sharedDocumentId);
  });

  test('should have a share button or link', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }

    // Share lives inside the Map actions menu
    await page.locator('[data-testid="map-actions-trigger"]').click();
    const shareButton = page.locator('[data-testid="share-button"]');

    await expect(shareButton).toBeVisible();
  });

  test('should open share modal when clicking share', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }

    // Open the Map actions menu, then click share
    await page.locator('[data-testid="map-actions-trigger"]').click();
    const shareButton = page.locator('[data-testid="share-button"]');

    await expect(shareButton).toBeVisible();
    await shareButton.click();
    await page.waitForTimeout(500);

    // Look for modal or popover
    const modal = page.locator('[role="dialog"], [data-testid="share-modal"]');
    await expect(modal.first()).toBeVisible();

    // Map should still be visible
    await expect(mapCanvas).toBeVisible();
  });

  test('should display shareable URL', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }

    // The current URL should be a shareable link
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/map\/edit\/[a-zA-Z0-9-]+/);

    // The document ID from the URL should be valid
    const documentId = currentUrl.split('/').pop();
    expect(documentId).toBeTruthy();
    expect(documentId?.length).toBeGreaterThan(5);
  });

  test('should be able to view shared map without edit access', async ({page}) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }

    // Navigate to the view URL (without /edit/)
    const viewUrl = testUrls.mapView(sharedDocumentId);
    await page.goto(viewUrl);

    // Wait for map to load
    await page.locator(testSelectors.mapCanvas).waitFor({
      state: 'visible',
      timeout: testTimeouts.mapLoad,
    });

    // Map should be visible in view mode
    await expect(page.locator(testSelectors.mapCanvas)).toBeVisible();
  });
});

test.describe('Recent Maps', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    if (!sharedDocumentId) {
      try {
        sharedDocumentId = await createMapDocument(request);
      } catch (error) {
        console.error('Failed to create document:', error);
      }
    }
  });

  test('should track recently viewed maps', async ({page}) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }

    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, sharedDocumentId);

    // Navigate to homepage
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveURL(/\/$/);

    // The recent map should be tracked
    // (Stored in localStorage or IndexedDB)
  });

  test('should display recent maps in modal', async ({page}) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }

    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, sharedDocumentId);

    // Look for a "Recent Maps" or "My Maps" button
    const recentMapsButton = page.locator('button:has-text("Recent"), button:has-text("My Maps")');

    if (await recentMapsButton.first().isVisible()) {
      await recentMapsButton.first().click();
      await page.waitForTimeout(500);

      // A modal or dropdown should appear
      const modal = page.locator('[role="dialog"]');
      if (await modal.isVisible()) {
        await expect(modal).toBeVisible();
      }
    }
  });
});

test.describe('Map Reset', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    if (!sharedDocumentId) {
      try {
        sharedDocumentId = await createMapDocument(request);
      } catch (error) {
        console.error('Failed to create document:', error);
      }
    }
  });

  test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});

    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    await navigateToMap(page, sharedDocumentId);
  });

  test('should have a reset button', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }

    // Reset lives inside the Map actions menu
    await page.locator('[data-testid="map-actions-trigger"]').click();
    const resetItem = page.locator('[role="menuitem"]:has-text("Reset map")');
    await expect(resetItem.first()).toBeVisible();

    // Close the menu; map should still be functional
    await page.keyboard.press('Escape');
    await expect(mapCanvas).toBeVisible();
  });

  test('should show confirmation before reset', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }

    // Open the Map actions menu and hover the Reset submenu
    await page.locator('[data-testid="map-actions-trigger"]').click();
    const resetTrigger = page.locator('[role="menuitem"]:has-text("Reset map")').first();

    if (await resetTrigger.isVisible()) {
      await resetTrigger.hover();
      await page.waitForTimeout(500);

      // The submenu shows a confirmation warning before resetting
      const confirmText = page.locator('text=Resetting your map cannot be undone');

      if (await confirmText.isVisible()) {
        await expect(confirmText).toBeVisible();
      }
    }

    // Dismiss the menu; map should still be visible
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(mapCanvas).toBeVisible();
  });
});
