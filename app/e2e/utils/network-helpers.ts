import { Page, Request, Response } from '@playwright/test';

/**
 * Network Request Testing Utilities
 * 
 * Helpers for intercepting, waiting for, and verifying API requests.
 */

/**
 * API endpoints used by the application
 */
export const API_ENDPOINTS = {
  createDocument: '**/api/create_document',
  getDocument: '**/api/document/*',
  updateAssignments: '**/api/update_assignments',
  getAssignments: '**/api/get_assignments/*',
  patchShatter: '**/api/shatter/*',
  patchUnshatter: '**/api/unshatter/*',
  root: '**/', // Returns {"message":"Hello World"}
  districtrMaps: '**/api/districtr_maps',
  cmsContent: '**/api/cms/*',
} as const;

/**
 * Wait for a specific API request to complete
 */
export async function waitForApiRequest(
  page: Page,
  urlPattern: string | RegExp,
  options: { timeout?: number; method?: string } = {}
): Promise<Response> {
  const { timeout = 10000, method } = options;
  
  const response = await page.waitForResponse(
    (resp) => {
      const urlMatches = typeof urlPattern === 'string' 
        ? resp.url().includes(urlPattern)
        : urlPattern.test(resp.url());
      
      const methodMatches = !method || resp.request().method() === method;
      
      return urlMatches && methodMatches;
    },
    { timeout }
  );
  
  return response;
}

/**
 * Wait for document creation API call
 */
export async function waitForDocumentCreation(
  page: Page,
  timeout = 15000
): Promise<{ documentId: string; response: Response }> {
  const response = await waitForApiRequest(page, API_ENDPOINTS.createDocument, {
    timeout,
    method: 'POST',
  });
  
  const json = await response.json();
  return {
    documentId: json.document_id,
    response,
  };
}

/**
 * Wait for assignment updates to complete
 */
export async function waitForAssignmentUpdate(
  page: Page,
  timeout = 10000
): Promise<Response> {
  return await waitForApiRequest(page, API_ENDPOINTS.updateAssignments, {
    timeout,
    method: 'PATCH',
  });
}

/**
 * Wait for document fetch to complete
 */
export async function waitForDocumentFetch(
  page: Page,
  documentId?: string,
  timeout = 10000
): Promise<Response> {
  const pattern = documentId 
    ? `**/api/document/${documentId}`
    : API_ENDPOINTS.getDocument;
  
  return await waitForApiRequest(page, pattern, { timeout, method: 'GET' });
}

/**
 * Intercept and mock an API response
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  response: {
    status?: number;
    json?: object;
    body?: string;
  }
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    await route.fulfill({
      status: response.status ?? 200,
      contentType: 'application/json',
      body: response.json ? JSON.stringify(response.json) : response.body,
    });
  });
}

/**
 * Collect all API requests made during an action
 */
export async function collectApiRequests(
  page: Page,
  action: () => Promise<void>,
  urlFilter?: string | RegExp
): Promise<Request[]> {
  const requests: Request[] = [];
  
  const handler = (request: Request) => {
    if (!urlFilter) {
      requests.push(request);
    } else if (typeof urlFilter === 'string' && request.url().includes(urlFilter)) {
      requests.push(request);
    } else if (urlFilter instanceof RegExp && urlFilter.test(request.url())) {
      requests.push(request);
    }
  };
  
  page.on('request', handler);
  
  await action();
  
  page.off('request', handler);
  
  return requests;
}

/**
 * Wait for all pending network requests to complete
 * Note: networkidle can be problematic with long-polling/streaming apps
 * Consider using waitForPageReady from map-fixture instead
 */
export async function waitForNetworkIdle(
  page: Page,
  timeout = 10000
): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    // networkidle often times out with map tiles - that's okay
    await page.waitForLoadState('domcontentloaded');
  }
}

/**
 * Check if the backend is reachable
 * The backend root returns {"message":"Hello World"}
 */
export async function isBackendReachable(
  page: Page,
  backendUrl?: string
): Promise<boolean> {
  const isDocker = process.env.IS_DOCKER === 'true';
  const url = backendUrl || (isDocker ? 'http://backend:8000' : 'http://localhost:8000');
  
  try {
    const response = await page.request.get(url);
    return response.ok();
  } catch {
    return false;
  }
}

/**
 * Get the base API URL from environment or default
 * Handles both Docker internal networking and host machine access
 */
export function getApiBaseUrl(): string {
  const isDocker = process.env.IS_DOCKER === 'true';
  const baseUrl = process.env.BASE_URL || (isDocker ? 'http://frontend:3000' : 'http://localhost:3000');
  
  // For local/Docker development, use the backend directly
  if (baseUrl.includes('localhost:3000') || baseUrl.includes('frontend:3000')) {
    return process.env.BACKEND_URL || (isDocker ? 'http://backend:8000' : 'http://localhost:8000');
  }
  
  // For deployed environments, API is typically at /api on the same domain
  // or you might have a separate API URL
  return process.env.API_URL || baseUrl;
}

/**
 * Intercept tile requests to speed up tests or provide consistent test data
 */
export async function interceptTileRequests(
  page: Page,
  options: {
    block?: boolean;
    delay?: number;
  } = {}
): Promise<void> {
  await page.route('**/*.pmtiles', async (route) => {
    if (options.block) {
      await route.abort();
    } else if (options.delay) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
      await route.continue();
    } else {
      await route.continue();
    }
  });
}

/**
 * Log all network requests for debugging
 */
export function enableRequestLogging(page: Page): void {
  page.on('request', (request) => {
    console.log(`>> ${request.method()} ${request.url()}`);
  });
  
  page.on('response', (response) => {
    console.log(`<< ${response.status()} ${response.url()}`);
  });
}

/**
 * Wait for PMTiles to load (map tile data)
 */
export async function waitForTilesLoaded(
  page: Page,
  timeout = 30000
): Promise<void> {
  // Wait for at least one tile request to complete
  await page.waitForResponse(
    (response) => response.url().includes('.pmtiles') && response.ok(),
    { timeout }
  ).catch(() => {
    // Tiles might already be loaded or cached
    console.log('Tile request not intercepted, may be cached');
  });
  
  // Wait for network to settle
  await waitForNetworkIdle(page, 5000).catch(() => {
    // Network might not fully settle, that's okay
  });
}
