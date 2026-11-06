import {test, expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {skipConditions, testTimeouts} from '../../fixtures/test-data';
import {
  createMapDocumentRecord,
  navigateToMap,
  waitForMapSettled,
} from '../../fixtures/map-fixture';
import {mapTools, skipWithoutWebMcp, type DistrictRow} from '../../utils/webmcp';

/**
 * Export the block-assignment CSV from one map, upload it on /uploader, and check
 * the new map matches. Imports land on the state's custom-districts module (a
 * different module, and here a different VTD vintage), so compare population per
 * district rather than area counts.
 */

const ZONES = [1, 2, 3];

/** Population per assigned zone, from get_district_summary. */
async function populationByZone(page: Page): Promise<Record<number, number>> {
  const rows: DistrictRow[] = await mapTools.districts(page);
  return Object.fromEntries(
    rows.filter(r => r.zone !== null && r.population > 0).map(r => [r.zone, r.population])
  );
}

test.describe('Export and import', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');
  test.setTimeout(120_000);

  test('a block-assignment CSV export re-imports as the same plan', async ({
    page,
    request,
  }, testInfo) => {
    const {document_id} = await createMapDocumentRecord(request);
    await navigateToMap(page, document_id);
    await skipWithoutWebMcp(page);

    // Paint a partial plan: three districts of 100 areas each.
    const ids = (await mapTools.loadedAreas(page, 300)).map(a => a.id);
    expect(ids).toHaveLength(300);
    for (const [i, zone] of ZONES.entries()) {
      await mapTools.assign(page, ids.slice(i * 100, (i + 1) * 100), zone);
    }
    await expect.poll(async () => Object.keys(await populationByZone(page))).toHaveLength(3);
    const source = await populationByZone(page);

    // Export (saves first, #669).
    await page.locator('[data-testid="map-actions-trigger"]').click();
    await page.getByRole('menuitem', {name: 'Export assignments'}).hover();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', {name: 'Block assignments (CSV)'}).click();
    const csvPath = testInfo.outputPath('export.csv');
    await (await download).saveAs(csvPath);

    const [header, ...rows] = (await readFile(csvPath, 'utf8')).trim().split('\n');
    expect(header.trim()).toBe('geo_id,zone');
    expect(rows.length).toBeGreaterThan(0);
    const exportedZones = new Set(rows.map(r => Number(r.split(',')[1])));
    expect([...exportedZones].sort()).toEqual(ZONES);

    // Import.
    await page.goto('/uploader');
    await expect(page.getByRole('button', {name: 'Choose files'})).toBeEnabled();
    await page.locator('input[type="file"]').setInputFiles(csvPath);
    const openMap = page.getByRole('link', {name: 'Open map'});
    await expect(openMap).toBeVisible({timeout: testTimeouts.long});
    await expect(page.getByText('Failed', {exact: true})).toHaveCount(0);
    // No GEOIDs skipped and no zone labels remapped: the export is a clean import.
    await expect(page.getByText(/not found in the map's geography/)).toHaveCount(0);
    await expect(page.getByText(/could not be used directly/)).toHaveCount(0);

    await page.goto((await openMap.getAttribute('href'))!);
    await waitForMapSettled(page);
    await expect.poll(() => populationByZone(page)).toEqual(source);
  });
});
