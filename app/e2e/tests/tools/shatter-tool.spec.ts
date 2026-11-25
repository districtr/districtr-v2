import {test, expect} from '@playwright/test';
import {
  createMapDocument,
  navigateToMap,
  getRegionScreenshot,
  settleAfter,
  selectTool,
  enableSuperDraw,
} from '../../fixtures/map-fixture';
import {testSelectors, skipConditions} from '../../fixtures/test-data';
import {getCurrentTool, getMapCenter, paintAtCoordinates} from '../../utils/map-helpers';
import {mapTools, skipWithoutWebMcp} from '../../utils/webmcp';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Shatter Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    sharedDocumentId = await createMapDocument(request);
  });

  test.beforeEach(async ({page}) => {
    // The shatter tool is only rendered in Super Draw; seed the persisted
    // toolbar store so a fresh browser context shows it.
    await enableSuperDraw(page);
    await navigateToMap(page, sharedDocumentId!);
  });

  test('should select the shatter tool when clicked', async ({page}) => {
    const shatterTool = page.locator(testSelectors.shatterTool);
    await shatterTool.click();
    await expect(shatterTool).toHaveAttribute('aria-pressed', 'true');
  });

  test('should shatter a painted area when clicked', async ({page}) => {
    const center = await getMapCenter(page);
    await selectTool(page, testSelectors.brushTool);
    await settleAfter(page, () => paintAtCoordinates(page, center.x, center.y));
    const painted = await getRegionScreenshot(page, center.x, center.y, 100);

    await selectTool(page, testSelectors.shatterTool);
    // Shattering draws the precinct's block outlines.
    await settleAfter(page, () => page.mouse.click(center.x, center.y));
    const shattered = await getRegionScreenshot(page, center.x, center.y, 100);
    expect(shattered.equals(painted)).toBe(false);
  });

  test('Break picks a different unit from block view; Paint stays inside it', async ({page}) => {
    // Runs on the WebMCP tools (prod-safe): zoom and focused unit from get_map_state,
    // on-screen points from locate_area.
    test.setTimeout(120000);
    await skipWithoutWebMcp(page);
    const shatterTool = page.locator(testSelectors.shatterTool);
    const pill = page.getByTestId('block-mode-pill');
    const focused = async () => (await mapTools.state(page)).focused_area;
    const assigned = async () => (await mapTools.state(page)).assigned_feature_count;

    await expect(shatterTool).toBeEnabled({timeout: 45000});
    // Zoom in (the map's own control zooms about the center) so the click lands on a
    // breakable unit.
    const zoomIn = page.locator(testSelectors.navigationZoomIn);
    for (let i = 0; i < 8 && (await mapTools.state(page)).zoom < 11; i++) {
      await zoomIn.click();
    }
    expect((await mapTools.state(page)).zoom).toBeGreaterThanOrEqual(11);

    await shatterTool.click();
    const center = await getMapCenter(page);
    await page.mouse.click(center.x, center.y);
    // Break stays armed in block view.
    await expect(pill).toContainText('Choose Paint', {timeout: 45000});
    expect(await getCurrentTool(page)).toBe('shatter');
    await expect.poll(focused, {timeout: 45000}).toBeTruthy();
    const firstId = await focused();

    // A screen point on an unbroken unit outside the captured blocks.
    const box = (await page.locator('.maplibregl-canvas').first().boundingBox())!;
    let outside: {x: number; y: number} | null = null;
    for (const area of await mapTools.loadedAreas(page, 5000)) {
      if (area.parent || area.id === firstId) continue;
      const at = await mapTools.locate(page, area.id);
      if ('visible' in at && at.visible) {
        outside = {x: box.x + at.x!, y: box.y + at.y!};
        break;
      }
    }
    expect(outside).not.toBeNull();

    // Paint never leaves the unit: a click outside it changes nothing. Map clicks are
    // handled synchronously, so state can be read right after the click.
    await page.locator(testSelectors.brushTool).click();
    await expect(pill).toContainText('Painting blocks');
    const before = await assigned();
    await page.mouse.click(outside!.x, outside!.y);
    expect(await assigned()).toBe(before);
    expect(await focused()).toBe(firstId);

    // Break jumps to the clicked unit.
    await shatterTool.click();
    await page.mouse.click(outside!.x, outside!.y);
    await expect.poll(focused, {timeout: 45000}).not.toBe(firstId);
    await expect.poll(focused).toBeTruthy();
    await expect(pill).toContainText('Choose Paint');

    // Exit keeps the active tool (Break here), and Escape again disarms it.
    await page.keyboard.press('Escape');
    await expect(pill).toContainText('to break down into blocks');
    expect(await getCurrentTool(page)).toBe('shatter');
  });
});
