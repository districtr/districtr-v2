import { Page, APIRequestContext } from '@playwright/test';
import { testUrls, testSelectors, testTimeouts, testConfig } from './test-data';

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
export async function getRegionScreenshot(page: Page, x: number, y: number, size = 50): Promise<Buffer> {
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
 * Create a map document via direct API call (faster than browser-based creation)
 * Returns the document ID
 */
export async function createMapDocument(request: APIRequestContext): Promise<string> {
  const backendURL = testConfig.backendURL;
  
  // 1. Fetch all views from the backend API
  const viewsResponse = await request.get(`${backendURL}/api/gerrydb/views`);
  if (!viewsResponse.ok()) {
    throw new Error(`Failed to fetch views from backend: ${viewsResponse.status()}`);
  }
  const views = await viewsResponse.json();

  if (!Array.isArray(views) || views.length === 0) {
    throw new Error('No views returned from backend');
  }
  const viewToCreate = views.find(view => view.districtr_map_slug.includes('co'));
  const firstView = views[0];
  const slug = viewToCreate?.districtr_map_slug ?? firstView.districtr_map_slug

  if (!slug) {
    throw new Error('No districtr_map_slug found on first view');
  }

  // 2. Create the document
  const createResponse = await request.post(`${backendURL}/api/create_document`, {
    data: {
      districtr_map_slug: slug,
    },
  });
  
  if (!createResponse.ok()) {
    throw new Error(`Failed to create document: ${createResponse.status()}`);
  }
  
  const documentData = await createResponse.json();
  
  if (!documentData.document_id) {
    throw new Error('No document_id in response');
  }
  
  return documentData.document_id;
}

/**
 * Navigate to a map edit page using a document ID
 */
export async function navigateToMap(page: Page, documentId: string): Promise<boolean> {
  await page.goto(testUrls.mapEdit(documentId));
  
  try {
    await page.locator(testSelectors.mapCanvas).waitFor({ 
      state: 'visible',
      timeout: testTimeouts.mapLoad 
    });
    // Give tiles a moment to start loading
    await page.waitForTimeout(1000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shared helper to navigate to a map editing page via browser
 * Handles the places -> place -> create flow with proper waiting
 * @deprecated Use createMapDocument + navigateToMap for faster, more reliable tests
 */
export async function navigateToNewMap(page: Page): Promise<{ success: boolean; skipReason?: string; documentId?: string }> {
  // Navigate to places
  await page.goto(testUrls.places);
  
  // Wait for place links to appear
  const placeLinks = page.locator('a[href*="/place/"]');
  try {
    await placeLinks.first().waitFor({ state: 'visible', timeout: testTimeouts.medium });
  } catch {
    return { success: false, skipReason: 'No places available' };
  }
  
  const count = await placeLinks.count();
  if (count === 0) {
    return { success: false, skipReason: 'No places available' };
  }
  
  // Wait for hydration before clicking
  await waitForHydration(page);
  
  // Click first place
  await placeLinks.first().click();
  
  // Wait for place page to load - look for create buttons specifically
  const createButtons = page.locator('button[aria-label^="Create "]');
  try {
    await createButtons.first().waitFor({ state: 'visible', timeout: testTimeouts.medium });
  } catch {
    // Fallback to any button
    const anyButtons = page.locator('button');
    try {
      await anyButtons.first().waitFor({ state: 'visible', timeout: testTimeouts.medium });
    } catch {
      return { success: false, skipReason: 'No create buttons available' };
    }
  }
  
  const buttonCount = await createButtons.count();
  if (buttonCount === 0) {
    // Try fallback to any button
    const anyButtons = page.locator('button');
    if ((await anyButtons.count()) === 0) {
      return { success: false, skipReason: 'No create buttons available' };
    }
    // Wait for hydration and click
    await waitForHydration(page);
    await anyButtons.first().click();
  } else {
    // Wait for hydration before clicking create button
    await waitForHydration(page);
    await createButtons.first().click();
  }
  
  // Wait for navigation to edit page
  try {
    await page.waitForURL(/\/map\/edit\//, { timeout: testTimeouts.long });
  } catch {
    return { success: false, skipReason: 'Failed to navigate to map edit page' };
  }
  
  // Extract document ID from URL
  const url = page.url();
  const match = url.match(/\/map\/edit\/([a-zA-Z0-9-]+)/);
  const documentId = match ? match[1] : undefined;
  
  // Wait for map canvas to be visible
  try {
    await page.locator(testSelectors.mapCanvas).waitFor({ 
      state: 'visible',
      timeout: testTimeouts.mapLoad 
    });
  } catch {
    return { success: false, skipReason: 'Map canvas did not load' };
  }
  
  // Give tiles a moment to start loading
  await page.waitForTimeout(1000);
  
  return { success: true, documentId };
}

/**
 * Wait for page content to be ready (without using networkidle)
 */
export async function waitForPageReady(page: Page, timeout = testTimeouts.medium): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // Wait for main content to be visible
  try {
    await page.getByRole('main').waitFor({ state: 'visible', timeout });
  } catch {
    // Fallback: just wait a bit for JS to hydrate
    await page.waitForTimeout(500);
  }
}

/**
 * Navigate to places and wait for content
 */
export async function navigateToPlaces(page: Page): Promise<{ success: boolean; placeCount: number }> {
  await page.goto(testUrls.places);
  await page.waitForLoadState('domcontentloaded');
  
  const placeLinks = page.locator('a[href*="/place/"]');
  try {
    await placeLinks.first().waitFor({ state: 'visible', timeout: testTimeouts.medium });
    const count = await placeLinks.count();
    return { success: true, placeCount: count };
  } catch {
    return { success: false, placeCount: 0 };
  }
}
