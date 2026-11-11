import {test, expect, type Page} from '@playwright/test';
import {skipConditions, testTimeouts} from '../../fixtures/test-data';
import {createMapDocumentRecord, navigateToMap} from '../../fixtures/map-fixture';
import {mapTools, skipWithoutWebMcp} from '../../utils/webmcp';

/**
 * Evaluation page on a complete plan. Painting every area by mouse is impractical,
 * so the plan is filled through the WebMCP assign_areas tool: every loaded area,
 * sorted by GEOID and cut into one band per district (contiguity doesn't matter here).
 */

/** Assign every loaded area to a district in GEOID bands; returns the area count. */
async function fillPlan(page: Page, numDistricts: number): Promise<number> {
  const ids = (await mapTools.loadedAreas(page, 5000)).map(a => a.id).sort();
  const perZone = Math.ceil(ids.length / numDistricts);
  for (let zone = 1; zone <= numDistricts; zone++) {
    const band = ids.slice((zone - 1) * perZone, zone * perZone);
    if (band.length) expect((await mapTools.assign(page, band, zone)).not_loaded).toEqual([]);
  }
  return ids.length;
}

/** Open a collapsed eval accordion section by its heading. */
async function openSection(page: Page, name: string) {
  await page.getByRole('heading', {name, exact: true}).click();
}

test.describe('Evaluation page', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');
  // Fill + save + on-demand metric compute (Reock, partisan) on first open.
  test.setTimeout(120_000);

  test('renders real metrics for a complete plan', async ({page, request}) => {
    const {document_id, public_id} = await createMapDocumentRecord(request);
    await navigateToMap(page, document_id);
    await skipWithoutWebMcp(page);

    const numDistricts = (await mapTools.state(page)).map.num_districts!;
    expect(await fillPlan(page, numDistricts)).toBeGreaterThan(0);
    // Every area loads at the default zoom, so the plan is complete.
    await expect
      .poll(async () => (await mapTools.districts(page)).find(r => r.zone === null))
      .toBeUndefined();

    const saveButton = page.locator('[data-testid="save-button"]');
    await saveButton.click();
    await expect(saveButton).toHaveAttribute('aria-label', 'All changes saved');

    await page.goto(`/map/${public_id}/eval`);
    const panel = page.locator('.eval-panel');
    await expect(panel.getByRole('heading', {name: 'Basics', exact: true})).toBeVisible({
      timeout: testTimeouts.long,
    });

    await openSection(page, 'Basics');
    await expect(panel).toContainText('This plan is complete');
    await expect(panel).toContainText(/of [\d,]+ people are not yet assigned/);
    await expect(panel).toContainText(/most populous district is District \d+/);
    await expect(panel).toContainText(/top-to-bottom deviation of [\d.]+%/);

    await openSection(page, 'Election Results and Partisanship');
    await expect(panel).toContainText(
      /average skew of [\d.]+ seats towards (Democrats|Republicans)/
    );
    await expect(panel.getByRole('heading', {name: 'Freedom-To-Vote Test'})).toBeVisible();
    await expect(panel).toContainText(
      /This plan (PASSES|DOES NOT PASS) the|Not enough recent Presidential and Senate election data/
    );
    await expect(panel.getByRole('heading', {name: 'Competitiveness'})).toBeVisible();
    await expect(summaryValue(page, 'Elections analyzed')).toHaveText(/^[1-9]\d*$/);

    await openSection(page, 'Splits');
    await expect(summaryValue(page, 'Total counties')).toHaveText(/^[1-9]\d*$/);
    await expect(summaryValue(page, 'Number of counties that are split')).toHaveText(/^\d+$/);

    await openSection(page, 'Compactness');
    await expect(panel).toContainText(/Your plan has [\d,]+ cut edges/);
    await expect(panel.getByText(/In your plan, scores range from/)).toHaveCount(2); // PP + Reock
    // One per-district row, each with a numeric Polsby-Popper and Reock score.
    const perDistrict = panel
      .locator('table')
      .filter({has: page.getByRole('columnheader', {name: 'District', exact: true})})
      .filter({hasText: 'Reock'})
      .locator('tbody tr');
    await expect(perDistrict).toHaveCount(numDistricts);
    for (const cell of await perDistrict.locator('td:nth-child(n+2)').all()) {
      await expect(cell).toHaveText(/^0?\.\d{3}$/);
    }

    await expect(panel).not.toContainText('Failed to load evaluation metrics');
    await expect(panel).not.toContainText('NaN');
  });
});

/** The bold value cell next to a label in the eval panel's summary tables. */
function summaryValue(page: Page, label: string) {
  return page
    .locator('.eval-panel tr')
    .filter({has: page.getByText(label, {exact: true})})
    .locator('td')
    .last();
}
