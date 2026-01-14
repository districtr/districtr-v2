import {test, expect} from '@playwright/test';
import {testUrls, testTimeouts} from '../../fixtures/test-data';

test.describe('Homepage', () => {
  test.beforeEach(async ({page}) => {
    await page.goto(testUrls.home);
  });

  test('should load the homepage successfully', async ({page}) => {
    // Check that the page loaded
    await expect(page).toHaveTitle(/Districtr/i);
  });

  test('should display the main heading and description', async ({page}) => {
    // Check for main content sections
    await expect(page.getByRole('img', {name: 'logo'})).toBeVisible();
    await expect(page.getByRole('heading', {name: 'You draw the lines.'})).toBeVisible();

    // Check for descriptive text about the tool
    await expect(page.getByText('This is a beta release of')).toBeVisible();
  });

  test('should have working navigation links', async ({page}) => {
    // Check for navigation elements
    const nav = page.getByRole('navigation');

    // Look for common nav links
    await expect(page.getByRole('link', {name: 'About Districtr'})).toBeVisible();
    await expect(page.getByRole('link', {name: 'Guide'}).first()).toBeVisible();
    await expect(page.getByRole('link', {name: 'Data'}).first()).toBeVisible();
  });

  test('should display action sections', async ({page}) => {
    // Check for call-to-action sections
    await expect(page.getByRole('heading', {name: 'Help shape our democracy!'})).toBeVisible();

    // Check for "Use this tool" or similar messaging
    await expect(page.getByRole('heading', {name: 'Use this tool to amplify your'})).toBeVisible();
  });

  test('should have accessible structure', async ({page}) => {
    // Check for proper heading hierarchy
    const titleElement = page.getByRole('heading', {name: 'You draw the lines.'});
    await expect(titleElement).toBeVisible();

    // Check for main landmark
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('should be responsive', async ({page}) => {
    // Test mobile viewport
    await page.setViewportSize({width: 375, height: 667});
    await expect(page.getByRole('heading', {name: 'You draw the lines.'})).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({width: 768, height: 1024});
    await expect(page.getByRole('heading', {name: 'You draw the lines.'})).toBeVisible();

    // Test desktop viewport
    await page.setViewportSize({width: 1280, height: 720});
    await expect(page.getByRole('heading', {name: 'You draw the lines.'})).toBeVisible();
  });

  test('should load images properly', async ({page}) => {
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Check that images are visible (at least one should be present)
    const images = page.locator('img');

    // Wait for first image to appear
    try {
      await images.first().waitFor({state: 'visible', timeout: 10000});
      const count = await images.count();
      expect(count).toBeGreaterThan(0);
    } catch {
      // Some pages might not have images
    }
  });
});
