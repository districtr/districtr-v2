import {test, expect} from '@playwright/test';
import {testUrls, testSelectors, skipConditions} from '../../fixtures/test-data';
import {
  createMapDocument,
  createMapDocumentRecord,
  navigateToMap,
  waitForMapSettled,
} from '../../fixtures/map-fixture';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Share Map', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, sharedDocumentId!);
  });

  test('should have a share button or link', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    // Share lives inside the Map actions menu
    await page.locator('[data-testid="map-actions-trigger"]').click();
    const shareButton = page.locator('[data-testid="share-button"]');

    await expect(shareButton).toBeVisible();
  });

  test('should open share modal when clicking share', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    // Open the Map actions menu, then click share
    await page.locator('[data-testid="map-actions-trigger"]').click();
    const shareButton = page.locator('[data-testid="share-button"]');

    await expect(shareButton).toBeVisible();
    await shareButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Map should still be visible
    await expect(mapCanvas).toBeVisible();
  });

  test('should display shareable URL', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    // The current URL should be a shareable link
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/map\/[a-zA-Z0-9-]+\/edit/);

    // The document ID from the URL should be valid
    const documentId = currentUrl.match(/\/map\/([a-zA-Z0-9-]+)\/edit/)?.[1];
    expect(documentId).toBeTruthy();
    expect(documentId?.length).toBeGreaterThan(5);
  });

  test('should be able to view shared map without edit access', async ({page, request}) => {
    // A viewer only ever has the public_id; the document UUID would grant edit.
    const {public_id} = await createMapDocumentRecord(request);
    await page.goto(testUrls.mapView(String(public_id)));
    await waitForMapSettled(page);
    await expect(page.locator(testSelectors.toolbar)).toHaveCount(0);
  });
});

test.describe('Map Reset', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId ??= await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, sharedDocumentId!);
  });

  test('should have a reset button', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
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
    // Open the Map actions menu and hover the Reset submenu
    await page.locator('[data-testid="map-actions-trigger"]').click();
    const resetTrigger = page.locator('[role="menuitem"]:has-text("Reset map")').first();

    await resetTrigger.hover();
    // The submenu shows a confirmation warning before resetting
    await expect(page.getByText('Resetting your map cannot be undone')).toBeVisible();

    // Dismiss the menu; map should still be visible
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(mapCanvas).toBeVisible();
  });
});
