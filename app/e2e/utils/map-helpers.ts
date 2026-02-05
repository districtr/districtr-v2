import { Page, Locator } from '@playwright/test';

/**
 * Map Canvas Testing Utilities
 * 
 * Helpers for interacting with and verifying the MapLibre GL canvas element.
 */

/**
 * Get the map canvas element
 */
export async function getMapCanvas(page: Page): Promise<Locator> {
  return page.locator('.maplibregl-canvas').first();
}

/**
 * Get the center coordinates of the map canvas
 */
export async function getMapCenter(page: Page): Promise<{ x: number; y: number }> {
  const canvas = await getMapCanvas(page);
  const box = await canvas.boundingBox();
  
  if (!box) {
    throw new Error('Map canvas not found or not visible');
  }
  
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * Get coordinates at a relative position on the map (0-1 range)
 */
export async function getMapCoordinates(
  page: Page, 
  relativeX: number, 
  relativeY: number
): Promise<{ x: number; y: number }> {
  const canvas = await getMapCanvas(page);
  const box = await canvas.boundingBox();
  
  if (!box) {
    throw new Error('Map canvas not found or not visible');
  }
  
  return {
    x: box.x + box.width * relativeX,
    y: box.y + box.height * relativeY,
  };
}

/**
 * Wait for the map to finish loading (tiles rendered)
 */
export async function waitForMapLoad(page: Page, timeout = 30000): Promise<void> {
  // Wait for the map canvas to be visible
  await page.locator('.maplibregl-canvas').first().waitFor({ 
    state: 'visible', 
    timeout 
  });
  
  // Wait for the map rendering state to be 'loaded' via Zustand store
  await page.waitForFunction(
    () => {
      // @ts-ignore - accessing window globals
      const mapStore = window.__ZUSTAND_STORES__?.mapStore;
      if (!mapStore) return false;
      const state = mapStore.getState();
      return state.mapRenderingState === 'loaded';
    },
    { timeout }
  ).catch(() => {
    // Fallback: wait for network idle if store check fails
    console.log('Store check failed, waiting for network idle');
  });
  
  // Additional wait for tiles to start rendering
  await page.waitForTimeout(1000);
}

/**
 * Wait for map to be in a ready state (tiles loaded, store initialized)
 */
export async function waitForMapReady(
  page: Page,
  timeout = 10000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        // @ts-ignore - accessing window globals
        const mapStore = window.__ZUSTAND_STORES__?.mapStore;
        if (!mapStore) return false;
        const state = mapStore.getState();
        // Check that map is initialized with some basic state
        return state && state.mapRef !== null;
      },
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Simulate clicking/painting at specific coordinates on the map
 */
export async function paintAtCoordinates(
  page: Page, 
  x: number, 
  y: number
): Promise<void> {
  await page.mouse.click(x, y);
}

/**
 * Simulate drag painting on the map (brush stroke)
 */
export async function dragOnMap(
  page: Page,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  steps = 10
): Promise<void> {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  
  // Move in steps to simulate realistic brush stroke
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const currentX = startX + (endX - startX) * progress;
    const currentY = startY + (endY - startY) * progress;
    await page.mouse.move(currentX, currentY);
    await page.waitForTimeout(10); // Small delay between steps
  }
  
  await page.mouse.up();
}

/**
 * Simulate painting a rectangular area
 */
export async function paintRectangle(
  page: Page,
  topLeftX: number,
  topLeftY: number,
  bottomRightX: number,
  bottomRightY: number
): Promise<void> {
  // Paint in a zigzag pattern to cover the area
  const rows = 5;
  const rowHeight = (bottomRightY - topLeftY) / rows;
  
  for (let i = 0; i < rows; i++) {
    const y = topLeftY + rowHeight * i + rowHeight / 2;
    const startX = i % 2 === 0 ? topLeftX : bottomRightX;
    const endX = i % 2 === 0 ? bottomRightX : topLeftX;
    
    await dragOnMap(page, startX, y, endX, y, 5);
    await page.waitForTimeout(50);
  }
}

/**
 * Pan the map by dragging
 */
export async function panMap(
  page: Page,
  deltaX: number,
  deltaY: number
): Promise<void> {
  const center = await getMapCenter(page);
  await dragOnMap(
    page,
    center.x,
    center.y,
    center.x + deltaX,
    center.y + deltaY,
    5
  );
}

/**
 * Zoom the map using mouse wheel
 */
export async function zoomMap(
  page: Page,
  zoomIn: boolean,
  steps = 3
): Promise<void> {
  const center = await getMapCenter(page);
  await page.mouse.move(center.x, center.y);
  
  const delta = zoomIn ? -100 : 100;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(100);
  }
}

/**
 * Take a screenshot of just the map canvas for visual comparison
 */
export async function snapshotMapCanvas(
  page: Page,
  name: string
): Promise<Buffer> {
  const canvas = await getMapCanvas(page);
  return await canvas.screenshot({ path: `./e2e/snapshots/${name}.png` });
}

/**
 * Mask dynamic elements before taking screenshots
 * (hides timestamps, user IDs, etc.)
 */
export async function maskDynamicElements(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      /* Hide dynamic content that changes between test runs */
      [data-dynamic="true"],
      .timestamp,
      .user-id,
      .document-id,
      time {
        visibility: hidden !important;
      }
    `
  });
}

/**
 * Check if the map document is loaded
 */
export async function isMapDocumentLoaded(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    // @ts-ignore - accessing window globals
    const mapStore = window.__ZUSTAND_STORES__?.mapStore;
    if (!mapStore) return false;
    const state = mapStore.getState();
    return state.mapDocument !== null;
  });
}

/**
 * Get the current tool from the controls store
 */
export async function getCurrentTool(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    // @ts-ignore - accessing window globals
    const controlsStore = window.__ZUSTAND_STORES__?.mapControlsStore;
    if (!controlsStore) return null;
    return controlsStore.getState().activeTool;
  });
}

/**
 * Get the currently selected zone
 */
export async function getSelectedZone(page: Page): Promise<number | null> {
  return await page.evaluate(() => {
    // @ts-ignore - accessing window globals
    const controlsStore = window.__ZUSTAND_STORES__?.mapControlsStore;
    if (!controlsStore) return null;
    return controlsStore.getState().selectedZone;
  });
}
