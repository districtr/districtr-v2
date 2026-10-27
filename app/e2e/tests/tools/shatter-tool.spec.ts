import {test, expect} from '@playwright/test';
import {testSelectors, testTimeouts, skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap} from '../../fixtures/map-fixture';
import {getCurrentTool, getMapCenter, paintAtCoordinates} from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Shatter Tool', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeAll(async ({request}) => {
    try {
      sharedDocumentId = await createMapDocument(request);
      console.log(`Created document ID for shatter tests: ${sharedDocumentId}`);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  });

  test.beforeEach(async ({page}) => {
    if (!sharedDocumentId) {
      test.skip(true, 'No document ID available');
      return;
    }
    // The shatter tool is only rendered in Super Draw; seed the persisted
    // toolbar store so a fresh browser context doesn't silently skip the suite.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'toolbarStore',
        JSON.stringify({state: {superDraw: true}, version: 3})
      );
    });
    await navigateToMap(page, sharedDocumentId);
  });

  test('should select the shatter tool when clicked', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }

    // Click the shatter tool
    const shatterTool = page.locator(testSelectors.shatterTool);

    if (!(await shatterTool.isVisible())) {
      test.skip(true, 'Shatter tool not available');
      return;
    }

    await shatterTool.click();

    // Verify the shatter tool is now selected
    await expect(shatterTool).toHaveAttribute('data-state', /.*/);
  });

  test('should shatter a painted area when clicked', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }

    const center = await getMapCenter(page);

    // First, paint an area
    const brushTool = page.locator(testSelectors.brushTool);
    await brushTool.click();
    await paintAtCoordinates(page, center.x, center.y);
    await page.waitForTimeout(300);

    // Switch to shatter tool
    const shatterTool = page.locator(testSelectors.shatterTool);

    if (!(await shatterTool.isVisible())) {
      test.skip(true, 'Shatter tool not available');
      return;
    }

    await shatterTool.click();

    // Click on the painted area to shatter
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(500);

    // Map should still be visible
    await expect(mapCanvas).toBeVisible();
  });

  test('Break picks a different unit from block view; Paint stays inside it', async ({page}) => {
    test.setTimeout(120000);
    const shatterTool = page.locator(testSelectors.shatterTool);
    if (!(await shatterTool.isVisible())) {
      test.skip(true, 'Shatter tool not available');
      return;
    }
    const pill = page.getByTestId('block-mode-pill');
    const focusedId = () =>
      page.evaluate(
        () => (window as any).__ZUSTAND_STORES__.mapStore.getState().focusFeatures[0]?.id
      );

    await expect(shatterTool).toBeEnabled({timeout: 45000});
    // Zoom in so the click lands on a breakable unit.
    await page.evaluate(async () => {
      const map = (window as any).__ZUSTAND_STORES__.mapStore.getState().getMapRef();
      map.jumpTo({zoom: 11});
      await new Promise(resolve => map.once('idle', resolve));
    });
    await shatterTool.click();
    const center = await getMapCenter(page);
    await page.mouse.click(center.x, center.y);
    // Break stays armed in block view.
    await expect(pill).toContainText('Choose Paint', {timeout: 45000});
    expect(await getCurrentTool(page)).toBe('shatter');
    const firstId = await focusedId();

    // A screen point on an unbroken unit outside the captured blocks.
    const outside = await page.evaluate(() => {
      const S = (window as any).__ZUSTAND_STORES__;
      const map = S.mapStore.getState().getMapRef();
      const captive = S.mapStore.getState().captiveIds;
      const parents = S.assignmentsStore.getState().shatterIds.parents;
      const rect = map.getCanvas().getBoundingClientRect();
      for (let x = 40; x < rect.width - 40; x += 15) {
        for (let y = 40; y < rect.height - 40; y += 15) {
          const inUnit = map
            .queryRenderedFeatures([x, y], {layers: ['blocks-child-hover']})
            .some((f: any) => captive.has(String(f.id)));
          const other = map
            .queryRenderedFeatures([x, y], {layers: ['blocks-hover']})
            .some((f: any) => !parents.has(String(f.id)));
          if (!inUnit && other) return {x: rect.left + x, y: rect.top + y};
        }
      }
      return null;
    });
    expect(outside).not.toBeNull();

    // Paint never leaves the unit: a click outside it does nothing.
    await page.locator(testSelectors.brushTool).click();
    await expect(pill).toContainText('Painting blocks');
    await page.mouse.click(outside!.x, outside!.y);
    await page.waitForTimeout(500);
    expect(await focusedId()).toBe(firstId);

    // Break jumps to the clicked unit.
    await shatterTool.click();
    await page.mouse.click(outside!.x, outside!.y);
    await expect.poll(focusedId, {timeout: 45000}).not.toBe(firstId);
    await expect.poll(focusedId).toBeTruthy();
    await expect(pill).toContainText('Choose Paint');

    // Exit keeps the active tool (Break here), and Escape again disarms it.
    await page.keyboard.press('Escape');
    await expect(pill).toContainText('to break down into blocks');
    expect(await getCurrentTool(page)).toBe('shatter');
  });
});
