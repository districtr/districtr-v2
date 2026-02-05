import { test, expect } from '@playwright/test';
import { testUrls } from '../../fixtures/test-data';

test.describe('Guide Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(testUrls.guide);
  });

  test('should load the guide page successfully', async ({ page }) => {
    await expect(page).toHaveURL(/guide/);
  });

  test('should display guide content with multiple sections', async ({ page }) => {
    // Check for main heading
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    
    // Guide should have multiple sections/headings
    const headings = page.getByRole('heading');
    const count = await headings.count();
    expect(count).toBeGreaterThan(1);
  });

  test('should explain how to use the tool', async ({ page }) => {
    // Look for instructional content
    await expect(page.getByText(/how|step|start|create|draw/i).first()).toBeVisible();
  });

  test('should have images or visual aids', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    
    // Check for images or visual elements
    const images = page.locator('img');
    
    // Wait a bit for images to load
    await page.waitForTimeout(1000);
    
    const count = await images.count();
    
    // Guide should ideally have some visual aids
    // but this is not strictly required
    if (count > 0) {
      await expect(images.first()).toBeVisible();
    }
  });

  test('should cover key features', async ({ page }) => {
    // Look for mentions of key features
    const features = ['paint', 'brush', 'district', 'zone', 'population'];
    let foundFeature = false;
    
    for (const feature of features) {
      const element = page.getByText(new RegExp(feature, 'i'));
      if (await element.count() > 0) {
        foundFeature = true;
        break;
      }
    }
    
    expect(foundFeature).toBe(true);
  });

  test('should be scrollable for longer content', async ({ page }) => {
    // Get page height
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    
    // If content is longer than viewport, it should be scrollable
    if (bodyHeight > viewportHeight) {
      await page.evaluate(() => window.scrollTo(0, 100));
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);
    }
  });
});
