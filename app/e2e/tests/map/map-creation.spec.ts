import { test, expect } from '@playwright/test';
import { testUrls, testTimeouts, skipConditions, testSelectors } from '../../fixtures/test-data';
import { createMapDocument, navigateToMap, waitForHydration } from '../../fixtures/map-fixture';
import { waitForNetworkIdle } from '../../utils/network-helpers';

// Shared state for document ID created in beforeAll
let sharedDocumentId: string | null = null;

test.describe('Map Creation', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access - skipped on production');

  test('should create a new map via API', async ({ request }) => {
    // Create document via API (fast, reliable)
    const documentId = await createMapDocument(request);
    
    expect(documentId).toBeTruthy();
    expect(typeof documentId).toBe('string');
    
    // Store for other tests
    sharedDocumentId = documentId;
    console.log(`Created document ID: ${sharedDocumentId}`);
  });

  test('should create a new map via browser UI', async ({ page }) => {
    await page.goto(testUrls.places);
    
    const placeLinks = page.locator('a[href*="/place/"]');
    await placeLinks.first().waitFor({ state: 'visible', timeout: testTimeouts.medium });
    
    const count = await placeLinks.count();
    if (count === 0) {
      test.skip(true, 'No places available');
      return;
    }
    
    await placeLinks.first().click();
    
    const createButtons = page.locator('button[aria-label^="Create "]');
    await createButtons.first().waitFor({ state: 'visible', timeout: testTimeouts.medium });
    
    const buttonCount = await createButtons.count();
    if (buttonCount === 0) {
      test.skip(true, 'No create buttons available');
      return;
    }
    
    await waitForHydration(page);
    await createButtons.first().click();
    
    // wait 5 seconds
    await page.waitForTimeout(5000);
    // Verify URL format
    expect(page.url()).toMatch(/\/map\/edit\/[a-zA-Z0-9-]+/);
  });
});

test.describe('Map Loading', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access - skipped on production');

  // Create a document once before all tests in this describe block
  test.beforeAll(async ({ request }) => {
    if (sharedDocumentId) {
      console.log(`Reusing existing document ID: ${sharedDocumentId}`);
      return;
    }
    
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created shared document ID: ${sharedDocumentId}`);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  });

  test('should load a map view page', async ({ page }) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available - previous test may have failed');
      return;
    }
    
    const loaded = await navigateToMap(page, sharedDocumentId);
    expect(loaded).toBe(true);
    
    await expect(page.locator(testSelectors.mapCanvas)).toBeVisible();
  });

  test('should display the toolbar when editing', async ({ page }) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available - previous test may have failed');
      return;
    }
    
    await navigateToMap(page, sharedDocumentId);
    
    const toolbar = page.locator(testSelectors.toolbar);
    await expect(toolbar).toBeVisible({ timeout: testTimeouts.medium });
  });

  test('should display the sidebar', async ({ page }) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available - previous test may have failed');
      return;
    }
    
    await page.setViewportSize({ width: 1280, height: 720 });
    await navigateToMap(page, sharedDocumentId);
    
    const sidebar = page.locator(testSelectors.sidebar);
    await expect(sidebar).toBeVisible({ timeout: testTimeouts.medium });
  });
});
