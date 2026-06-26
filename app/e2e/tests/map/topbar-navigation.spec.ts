import {test, expect, type Page} from '@playwright/test';
import {testTimeouts, skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap} from '../../fixtures/map-fixture';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

/** Open the main hamburger ("Districtr") menu in the topbar. */
async function openMainMenu(page: Page) {
  await page.locator('button', {hasText: 'Districtr'}).first().click();
  await page.waitForTimeout(300);
}

test.describe('Topbar navigation menu', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for topbar nav tests: ${sharedDocumentId}`);
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

  test('links saved maps to the static Catalog page, with no in-map creator', async ({page}) => {
    await openMainMenu(page);

    // Saved maps live on the static Catalog page.
    await expect(page.locator('a[href="/catalog"]')).toBeVisible();

    // The old in-map "Create new map" geography picker is gone.
    await expect(page.getByText('Create new map', {exact: true})).toHaveCount(0);
    await expect(page.getByText('Select a geography', {exact: true})).toHaveCount(0);
  });

  test('"Catalog" navigates to the catalog page', async ({page}) => {
    await openMainMenu(page);
    await page.locator('a[href="/catalog"]').click();
    await page.waitForURL(/\/catalog/, {timeout: testTimeouts.long});
    expect(page.url()).toMatch(/\/catalog/);
  });
});

test.describe('View switcher', () => {
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

  test('shows the current mode and offers Edit / Display / Evaluate', async ({page}) => {
    const switcher = page.getByRole('button', {name: 'Switch view'});
    await expect(switcher).toBeVisible();
    await expect(switcher).toContainText('Editing');

    await switcher.click();
    await expect(page.getByRole('menuitem', {name: /Editing/})).toBeVisible();
    await expect(page.getByRole('menuitem', {name: /Display/})).toBeVisible();
    await expect(page.getByRole('menuitem', {name: /Evaluate/})).toBeVisible();
  });

  test('switching to Evaluate shows a brief pre-loader, then the evaluation view', async ({
    page,
  }) => {
    const switcher = page.getByRole('button', {name: 'Switch view'});
    await switcher.click();
    await page.getByRole('menuitem', {name: /Evaluate/}).click();

    // A short "preparation" speed bump appears before navigating.
    await expect(page.getByText('Preparing evaluation')).toBeVisible({
      timeout: testTimeouts.medium,
    });

    // Then it lands on the evaluation view. (Display/Evaluate are keyed on the
    // public_id; an editor on an unshared draft mints one transparently, so allow
    // extra time for that round-trip plus the ~3s pre-loader.)
    await page.waitForURL(/\/map\/eval\/\d+/, {timeout: testTimeouts.long});
    await expect(page.getByRole('button', {name: 'Switch view'})).toContainText('Evaluate');
  });
});
