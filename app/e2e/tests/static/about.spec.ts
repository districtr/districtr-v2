import { test, expect } from '@playwright/test';
import { testUrls } from '../../fixtures/test-data';

test.describe('About Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(testUrls.about);
  });

  test('should load the about page successfully', async ({ page }) => {
    await expect(page).toHaveURL(/about/);
  });

  test('should display about content', async ({ page }) => {
    // Check for main heading
    await expect(page.getByRole('heading', { name: 'About Districtr' })).toBeVisible();
    
    // Check for about-related content
    const mainContent = page.getByRole('main');
    await expect(mainContent).toBeVisible();
  });

  test('should have navigation back to home', async ({ page }) => {
    // Check for home link or logo
    const homeLink = page.getByRole('link', { name: /districtr|home/i });
    await expect(homeLink.first()).toBeVisible();
  });

  test('should display team or organization info', async ({ page }) => {
    // Look for content about the team/organization
    await expect(page.getByText(/mggg|redistricting|team|about/i).first()).toBeVisible();
  });
});
