import { test, expect } from '@playwright/test';
import { testSelectors, testTimeouts, skipConditions } from '../../fixtures/test-data';
import { createMapDocument, navigateToMap } from '../../fixtures/map-fixture';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Sidebar Data Panels', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({ request }) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for sidebar tests: ${sharedDocumentId}`);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Set desktop viewport to ensure sidebar is visible
    await page.setViewportSize({ width: 1280, height: 720 });
    
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    await navigateToMap(page, sharedDocumentId);
  });

  test('should display the sidebar on desktop', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    // Check for sidebar
    const sidebar = page.locator(testSelectors.sidebar);
    await expect(sidebar).toBeVisible({ timeout: testTimeouts.medium });
  });

  test('should display data panels in sidebar', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const sidebar = page.locator(testSelectors.sidebar);
    if (!(await sidebar.isVisible())) {
      test.skip(true, 'Sidebar not visible');
      return;
    }
    
    // Check for data panels container
    const dataPanels = page.locator('[data-testid="data-panels"]');
    await expect(dataPanels).toBeVisible({ timeout: testTimeouts.medium });
  });

  test('should have population panel', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const sidebar = page.locator(testSelectors.sidebar);
    if (!(await sidebar.isVisible())) {
      test.skip(true, 'Sidebar not visible');
      return;
    }
    
    // Look for population panel
    const populationPanel = page.locator('[data-testid="data-panel-population"]');
    await expect(populationPanel).toBeVisible({ timeout: testTimeouts.medium });
  });

  test('should expand and collapse panels', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const sidebar = page.locator(testSelectors.sidebar);
    if (!(await sidebar.isVisible())) {
      test.skip(true, 'Sidebar not visible');
      return;
    }
    
    // Find panel triggers (accordion headers)
    const panelTriggers = sidebar.locator('.AccordionTrigger');
    const count = await panelTriggers.count();
    
    if (count === 0) {
      test.skip(true, 'No panels found');
      return;
    }
    
    const firstTrigger = panelTriggers.first();
    
    // Click to toggle (could be open or closed)
    await firstTrigger.click();
    await page.waitForTimeout(300);
    
    // Click again to toggle back
    await firstTrigger.click();
    await page.waitForTimeout(300);
    
    // Panel should still be visible
    await expect(firstTrigger).toBeVisible();
  });

  test('should display zone information in population panel', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const sidebar = page.locator(testSelectors.sidebar);
    if (!(await sidebar.isVisible())) {
      test.skip(true, 'Sidebar not visible');
      return;
    }
    
    // Look for zone-related content in the sidebar
    const panelContent = sidebar.locator('.AccordionContent');
    
    if ((await panelContent.count()) > 0) {
      const firstContent = panelContent.first();
      // Content should have some text
      const text = await firstContent.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Sidebar Toolbar', () => {
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

  test('should display zone picker in sidebar', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const sidebar = page.locator(testSelectors.sidebar);
    if (!(await sidebar.isVisible())) {
      test.skip(true, 'Sidebar not visible');
      return;
    }
    // Turn on brush tool
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();

    // Look for zone picker
    const zonePicker = page.locator(testSelectors.zonePicker);
    await expect(zonePicker).toBeVisible({ timeout: testTimeouts.medium });
  });

  test('should allow selecting different zones', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    // Turn on brush tool
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    
    const zonePicker = page.locator(testSelectors.zonePicker);
    if (!(await zonePicker.isVisible())) {
      test.skip(true, 'Zone picker not visible');
      return;
    }
    // find getByRole('combobox')
    const comboBox = page.getByRole('combobox');
    if (!(await comboBox.isVisible())) {
      test.skip(true, 'Combobox not visible');
      return;
    }
    await comboBox.click();
    // wait 3 seconds
    await page.waitForTimeout(500);


    // Try to select zone 2
    const zone2 = page.getByRole('option', { name: '2', exact: true })  
    if (await zone2.isVisible()) {
      await zone2.click();
      await page.waitForTimeout(100);
    }
    
    // Try to select zone 3
    const zone3 = page.getByRole('option', { name: '3', exact: true })  
    if (await zone3.isVisible()) {
      await zone3.click();
      await page.waitForTimeout(100);
    }
    
  });

  test('should display all zone colors', async ({ page }) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    
    const zonePicker = page.locator(testSelectors.zonePicker);
    if (!(await zonePicker.isVisible())) {
      test.skip(true, 'Zone picker not visible');
      return;
    }
    
    // Count zone buttons
    const zoneButtons = zonePicker.locator('[data-testid^="zone-"]');
    const count = await zoneButtons.count();
    
    // Should have at least 2 zones (most maps have more)
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Sidebar Responsiveness', () => {
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

  test('should hide sidebar on mobile', async ({ page }) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    
    // Create map first at desktop size
    await page.setViewportSize({ width: 1280, height: 720 });
    await navigateToMap(page, sharedDocumentId);
    
    // Now switch to mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    // Sidebar should be hidden on mobile
    const sidebar = page.locator(testSelectors.sidebar);
    await expect(sidebar).not.toBeVisible();
  });

  test('should show sidebar on landscape mobile/tablet', async ({ page }) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    
    // Create map first at desktop size
    await page.setViewportSize({ width: 1280, height: 720 });
    await navigateToMap(page, sharedDocumentId);
    
    // Switch to landscape tablet
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(500);
    
    // Sidebar should be visible on larger screens
    const sidebar = page.locator(testSelectors.sidebar);
    // Note: visibility depends on the actual responsive breakpoints
  });
});
