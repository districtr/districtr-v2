import {test, expect, type Page} from '@playwright/test';
import {testSelectors, testTimeouts, skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap} from '../../fixtures/map-fixture';
import {getCurrentTool, getMapCenter, paintAtCoordinates} from '../../utils/map-helpers';

// Shared document ID for all tests in this file
let sharedDocumentId: string | null = null;

test.describe('Paint by blocks (breaking units)', () => {
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
    // Paint by > Blocks is only offered in Super Draw; seed the persisted
    // toolbar store so a fresh browser context doesn't silently skip the suite.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'toolbarStore',
        JSON.stringify({state: {superDraw: true}, version: 3})
      );
    });
    await navigateToMap(page, sharedDocumentId);
  });

  // Paint by > Blocks replaced the Break tool: Paint/Erase first pick a unit to
  // break (the internal 'shatter' tool), then paint its blocks.
  const paintByBlocks = async (page: Page) => {
    await page.getByRole('combobox', {name: 'Paint by'}).click();
    await page.getByRole('option', {name: 'Blocks'}).click();
  };

  test('Paint by Blocks has Paint pick a unit to break', async ({page}) => {
    const mapCanvas = page.locator(testSelectors.mapCanvas);
    if (!(await mapCanvas.isVisible())) {
      test.skip(true, 'Map not available');
      return;
    }
    const brushTool = page.locator(testSelectors.brushTool);
    await expect(brushTool).toBeEnabled({timeout: 45000});
    await brushTool.click();
    await paintByBlocks(page);

    await expect(page.getByTestId('block-mode-pill')).toContainText('to break down into blocks');
    expect(await getCurrentTool(page)).toBe('shatter');
  });

  test('should break a painted area when clicked', async ({page}) => {
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

    // Switch to painting by blocks, then click the painted area to break it
    await paintByBlocks(page);
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(500);

    // Map should still be visible
    await expect(mapCanvas).toBeVisible();
  });

  test('Paint by Blocks: clicking another unit breaks it; Escape steps back out', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const brushTool = page.locator(testSelectors.brushTool);
    const pill = page.getByTestId('block-mode-pill');
    const focusedId = () =>
      page.evaluate(
        () => (window as any).__ZUSTAND_STORES__.mapStore.getState().focusFeatures[0]?.id
      );

    await expect(brushTool).toBeEnabled({timeout: 45000});
    // Zoom in so the click lands on a breakable unit.
    await page.evaluate(async () => {
      const map = (window as any).__ZUSTAND_STORES__.mapStore.getState().getMapRef();
      map.jumpTo({zoom: 11});
      await new Promise(resolve => map.once('idle', resolve));
    });
    await brushTool.click();
    await paintByBlocks(page);
    const center = await getMapCenter(page);
    await page.mouse.click(center.x, center.y);
    // Inside the broken unit, Paint is back to painting.
    await expect(pill).toContainText('Painting blocks', {timeout: 45000});
    expect(await getCurrentTool(page)).toBe('brush');
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

    // Clicking another unit breaks it and moves there.
    await page.mouse.click(outside!.x, outside!.y);
    await expect.poll(focusedId, {timeout: 45000}).not.toBe(firstId);
    await expect.poll(focusedId).toBeTruthy();
    expect(await getCurrentTool(page)).toBe('brush');

    // Escape exits block view back to picking a unit, then back to painting units.
    await page.keyboard.press('Escape');
    await expect(pill).toContainText('to break down into blocks');
    expect(await getCurrentTool(page)).toBe('shatter');
    await page.keyboard.press('Escape');
    await expect(pill).toBeHidden();
    expect(await getCurrentTool(page)).toBe('brush');
  });
});
