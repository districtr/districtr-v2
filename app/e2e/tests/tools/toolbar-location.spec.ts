import {test, expect} from '@playwright/test';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap} from '../../fixtures/map-fixture';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Toolbar is fixed to the sidebar', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for toolbar tests: ${sharedDocumentId}`);
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

  test('renders the toolbar inside the sidebar', async ({page}) => {
    const sidebarToolbar = page.locator(`${testSelectors.sidebar} ${testSelectors.toolbar}`);
    await expect(sidebarToolbar).toBeVisible();
  });

  test('does not offer to move the toolbar to the map area', async ({page}) => {
    // The "Move toolbar to map area" affordance has been removed.
    await expect(page.getByText('Move toolbar to map area')).toHaveCount(0);
  });
});
