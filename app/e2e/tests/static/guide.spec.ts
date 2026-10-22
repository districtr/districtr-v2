import {test, expect} from '@playwright/test';
import {testUrls} from '../../fixtures/test-data';

test.describe('Guide Page', () => {
  test.beforeEach(async ({page}) => {
    await page.goto(testUrls.guide);
  });

  test('should load the guide page successfully', async ({page}) => {
    await expect(page).toHaveURL(/guide/);
  });

  // fixme: the guide renders no <h1> (screen readers get no page title heading).
  test.fixme('should have a main heading', async ({page}) => {
    await expect(page.getByRole('heading', {level: 1})).toBeVisible();
  });

  test('should display guide content with multiple sections', async ({page}) => {
    await expect(page.getByRole('heading').first()).toBeVisible();
    // Guide should have multiple sections/headings
    const headings = page.getByRole('heading');
    const count = await headings.count();
    expect(count).toBeGreaterThan(1);
  });

  test('should explain how to use the tool', async ({page}) => {
    // Look for instructional content
    await expect(page.getByText(/how|step|start|create|draw/i).first()).toBeVisible();
  });

  test('should have images or visual aids', async ({page}) => {
    // The guide's visual aids are looping demo videos.
    await expect(page.locator('img, video').first()).toBeVisible();
  });

  test('should cover key features', async ({page}) => {
    // Look for mentions of key features
    const features = ['paint', 'brush', 'district', 'zone', 'population'];
    let foundFeature = false;

    for (const feature of features) {
      const element = page.getByText(new RegExp(feature, 'i'));
      if ((await element.count()) > 0) {
        foundFeature = true;
        break;
      }
    }

    expect(foundFeature).toBe(true);
  });

  test('should be scrollable for longer content', async ({page}) => {
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
