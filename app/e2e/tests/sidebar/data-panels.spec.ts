import {test, expect} from '@playwright/test';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap, selectTool} from '../../fixtures/map-fixture';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Sidebar', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    // Desktop viewport so the sidebar is visible
    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, sharedDocumentId!);
  });

  test('shows the workflow tabs, Population first', async ({page}) => {
    const tabs = page.getByRole('navigation', {name: 'Sidebar panels'});
    await expect(tabs.getByRole('button', {name: 'Population'})).toHaveAttribute(
      'aria-current',
      'true'
    );
    await expect(page.locator('[data-testid="data-panel-population"]')).toBeVisible();
  });

  test('switches panels when a tab is clicked', async ({page}) => {
    const tabs = page.getByRole('navigation', {name: 'Sidebar panels'});
    for (const [label, key] of [
      ['Stats', 'stats'],
      ['Map Layers', 'mapLayers'],
      ['Population', 'population'],
    ]) {
      await tabs.getByRole('button', {name: label}).click();
      await expect(tabs.getByRole('button', {name: label})).toHaveAttribute('aria-current', 'true');
      await expect(page.locator(`[data-testid="data-panel-${key}"]`)).toBeVisible();
    }
  });

  test('shows one zone button per district and selects on click', async ({page}) => {
    await selectTool(page, testSelectors.brushTool);
    const zonePicker = page.locator(testSelectors.zonePicker);
    await expect(zonePicker).toBeVisible();
    expect(await zonePicker.locator('[data-testid^="zone-"]').count()).toBeGreaterThanOrEqual(2);

    await page.locator(testSelectors.zoneButton(2)).click();
    await expect(page.locator(testSelectors.zoneButton(2))).toHaveAttribute(
      'data-state',
      'checked'
    );
    await expect(page.locator(testSelectors.zoneButton(1))).toHaveAttribute(
      'data-state',
      'unchecked'
    );
  });
});

test.describe('Sidebar Responsiveness', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId ??= await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, sharedDocumentId!);
  });

  test('hides the sidebar on mobile and moves tools to the dock', async ({page}) => {
    await page.setViewportSize({width: 375, height: 667});
    await expect(page.locator(testSelectors.sidebar)).not.toBeVisible();
    await expect(page.locator(testSelectors.toolbar)).toBeVisible();

    // Selecting the paint tool reveals the brush controls.
    await selectTool(page, testSelectors.brushTool);
    await expect(page.getByText('Brush Size')).toBeVisible();
  });

  test('shows the sidebar on landscape tablet', async ({page}) => {
    await page.setViewportSize({width: 1024, height: 768});
    await expect(page.locator(testSelectors.sidebar)).toBeVisible();
  });
});
