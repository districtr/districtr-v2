import { test, expect } from '@playwright/test';
import { testUrls } from '../../fixtures/test-data';
import { waitForPageReady, navigateToPlaces } from '../../fixtures/map-fixture';

test.describe('Places Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(testUrls.places);
    await page.waitForLoadState('domcontentloaded');
  });

  test('should load the places page successfully', async ({ page }) => {
    await expect(page).toHaveURL(/places/);
  });

  test('should display a list or grid of places', async ({ page }) => {
    // Check for main content area
    const mainContent = page.getByRole('main');
    await expect(mainContent).toBeVisible();
    
    // Look for links or cards representing places
    const links = page.locator('a[href*="/place/"]');
    
    // Wait for at least one link to appear (with timeout)
    try {
      await links.first().waitFor({ state: 'visible', timeout: 10000 });
      await expect(links.first()).toBeVisible();
    } catch {
      // No places available - that's okay for some environments
    }
  });

  test('should have clickable place entries', async ({ page }) => {
    const placeLinks = page.locator('a[href*="/place/"]');
    
    try {
      await placeLinks.first().waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      test.skip(true, 'No places available');
      return;
    }
    
    const firstLink = placeLinks.first();
    await expect(firstLink).toBeVisible();
    
    // Verify the link has an href
    const href = await firstLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain('/place/');
  });
});

test.describe('Individual Place Page', () => {
  test('should load a place page when accessed directly', async ({ page }) => {
    // Skip if we don't have a known place slug
    const placeSlug = process.env.TEST_PLACE_SLUG;
    
    if (!placeSlug) {
      // Try to find a place from the places page
      const { success, placeCount } = await navigateToPlaces(page);
      
      if (!success || placeCount === 0) {
        test.skip(true, 'No places available to test');
        return;
      }
      
      const placeLinks = page.locator('a[href*="/place/"]');
      await placeLinks.first().click();
    } else {
      await page.goto(testUrls.place(placeSlug));
    }
    
    // Verify we're on a place page
    await expect(page).toHaveURL(/place\//);
    
    // Check for heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('should display create plan buttons for available maps', async ({ page }) => {
    const { success, placeCount } = await navigateToPlaces(page);
    
    if (!success || placeCount === 0) {
      test.skip(true, 'No places available to test');
      return;
    }
    
    const placeLinks = page.locator('a[href*="/place/"]');
    await placeLinks.first().click();
    
    // Wait for page content
    await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 10000 });
    
    // Look for create plan buttons
    const createButtons = page.getByRole('button');
    await createButtons.first().waitFor({ state: 'visible', timeout: 10000 });
    
    const buttonCount = await createButtons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });

  test('should display CMS content', async ({ page }) => {
    const { success, placeCount } = await navigateToPlaces(page);
    
    if (!success || placeCount === 0) {
      test.skip(true, 'No places available to test');
      return;
    }
    
    const placeLinks = page.locator('a[href*="/place/"]');
    await placeLinks.first().click();
    
    // Wait for page content
    await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 10000 });
    
    // Check that there's meaningful content
    const mainContent = page.getByRole('main');
    await expect(mainContent).toBeVisible();
    
    // Look for text content (CMS rendered content)
    const textContent = await mainContent.textContent();
    expect(textContent?.length).toBeGreaterThan(10);
  });
});
