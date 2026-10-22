import {Page} from '@playwright/test';

/**
 * Map canvas helpers. For readiness, use waitForMapSettled / settleAfter
 * (fixtures/map-fixture); for state, use the WebMCP tools (utils/webmcp).
 */

/** Center of the map canvas in page coordinates. */
export async function getMapCenter(page: Page): Promise<{x: number; y: number}> {
  const box = await page.locator('.maplibregl-canvas').first().boundingBox();
  if (!box) throw new Error('Map canvas not found or not visible');
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/** Click on the map (a brush/eraser click-paint). */
export async function paintAtCoordinates(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.click(x, y);
}

/** Drag across the map in steps, like a brush stroke. */
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
  await page.mouse.move(endX, endY, {steps});
  await page.mouse.up();
}
