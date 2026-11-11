import {Page, APIRequestContext, expect} from '@playwright/test';
import {testUrls, testSelectors, testTimeouts, testConfig} from './test-data';

/**
 * Wait for React hydration to complete
 * In Next.js dev mode, SSR HTML is visible before React attaches event handlers
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.readyState === 'complete');
  // Extra buffer for React to attach event handlers
  await page.waitForTimeout(300);
}

/**
 * Take a screenshot of a specific region around a point
 * Useful for comparing canvas changes before/after painting
 * Returns a Buffer that can be compared
 */
export async function getRegionScreenshot(
  page: Page,
  x: number,
  y: number,
  size = 50
): Promise<Buffer> {
  return await page.screenshot({
    clip: {
      x: Math.max(0, x - size / 2),
      y: Math.max(0, y - size / 2),
      width: size,
      height: size,
    },
  });
}

/**
 * Create a map document via direct API call (faster than browser-based creation).
 * Map comes from TEST_MAP_SLUG (default al_congressional_districts).
 * document_id is the edit capability; public_id is what a viewer gets.
 */
export async function createMapDocumentRecord(
  request: APIRequestContext
): Promise<{document_id: string; public_id: number}> {
  const response = await request.post(`${testConfig.backendURL}/api/create_document`, {
    data: {districtr_map_slug: testConfig.testMapSlug},
  });
  if (!response.ok()) {
    throw new Error(
      `Failed to create ${testConfig.testMapSlug} document: ${response.status()} ${await response.text()}`
    );
  }
  return await response.json();
}

/** createMapDocumentRecord, returning just the document_id. */
export async function createMapDocument(request: APIRequestContext): Promise<string> {
  return (await createMapDocumentRecord(request)).document_id;
}

// Readiness attributes set by MapContainer and the map's idle/render handlers.
// Unlike window.__ZUSTAND_STORES__ these exist in production builds too.
const SETTLED_MAP =
  '[data-testid="map-container"][data-app-state="loaded"][data-render-state="loaded"] .maplibregl-map[data-idle="true"]';

/** Wait until the document is loaded, tiles are rendered, and the map is idle. */
export async function waitForMapSettled(page: Page, timeout = testTimeouts.mapLoad): Promise<void> {
  await page.locator(SETTLED_MAP).first().waitFor({state: 'attached', timeout});
}

/**
 * Run a map action (paint, zoom, pan) and wait for the repaint it causes.
 * Clears data-idle first so a stale "true" from before the action can't satisfy the wait;
 * the action must trigger a render or this times out.
 */
export async function settleAfter(page: Page, action: () => Promise<unknown>): Promise<void> {
  await page
    .locator('.maplibregl-map')
    .first()
    .evaluate(el => ((el as HTMLElement).dataset.idle = 'false'));
  await action();
  await waitForMapSettled(page, testTimeouts.medium);
}

/**
 * Make a toolbar tool active. Clicking an active tool toggles it back to pan, and a
 * new map opens with the brush already active, so only click when it isn't pressed.
 */
export async function selectTool(page: Page, selector: string): Promise<void> {
  const button = page.locator(selector);
  if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** Seed the persisted toolbar store so the page opens in Super Draw (shatter, inspector). */
export async function enableSuperDraw(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'toolbarStore',
      JSON.stringify({state: {superDraw: true}, version: 3})
    );
  });
}

/** Navigate to a map edit page and wait for it to settle. Throws if it never does. */
export async function navigateToMap(page: Page, documentId: string): Promise<void> {
  await page.goto(testUrls.mapEdit(documentId));
  await waitForMapSettled(page);
}

/**
 * Wait for page content to be ready (without using networkidle)
 */
export async function waitForPageReady(page: Page, timeout = testTimeouts.medium): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // Wait for main content to be visible
  try {
    await page.getByRole('main').waitFor({state: 'visible', timeout});
  } catch {
    // Fallback: just wait a bit for JS to hydrate
    await page.waitForTimeout(500);
  }
}

/**
 * Navigate to places and wait for content
 */
export async function navigateToPlaces(
  page: Page
): Promise<{success: boolean; placeCount: number}> {
  await page.goto(testUrls.places);
  await page.waitForLoadState('domcontentloaded');

  const placeLinks = page.locator('a[href*="/place/"]');
  try {
    await placeLinks.first().waitFor({state: 'visible', timeout: testTimeouts.medium});
    const count = await placeLinks.count();
    return {success: true, placeCount: count};
  } catch {
    return {success: false, placeCount: 0};
  }
}
