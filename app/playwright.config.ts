import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for Districtr v2
 * 
 * Supports multiple environments via BASE_URL environment variable:
 * - Local: BASE_URL=http://localhost:3000 (default)
 * - Preview: BASE_URL=https://districtr-v2-pr-123.fly.dev
 * - Staging: BASE_URL=https://staging.districtr.org
 */

const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const isLocal = baseURL.includes('localhost');

export default defineConfig({
  testDir: './e2e/tests',
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,
  
  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'on-first-retry',
  },

  /* Timeout settings - longer for map loading */
  timeout: 60000, // 60 seconds for all tests (maps are slow)
  
  /* Expect timeout for assertions */
  expect: {
    timeout: 15000,
    /* Visual comparison settings for map screenshots */
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.1,
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  /* Run global setup only for local environment */
  globalSetup: isLocal ? './e2e/global-setup.ts' : undefined,

  /* Output folder for test artifacts */
  outputDir: 'test-results/',

  /* Folder for test snapshots */
  snapshotDir: './e2e/snapshots',
});
