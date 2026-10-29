import {test, expect, type Page} from '@playwright/test';
import {skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap} from '../../fixtures/map-fixture';
import {mapTools, skipWithoutWebMcp, type DistrictRow} from '../../utils/webmcp';

/**
 * The sidebar's numbers must agree with the map's state, read through WebMCP.
 * Assignments go through assign_areas so the areas (and populations) are known.
 */

const fmt = (n: number) => n.toLocaleString('en-US');

/** Wait for the summary to reflect an assignment; ingest is async. */
async function districtsWhen(page: Page, ready: (rows: DistrictRow[]) => boolean) {
  let rows: DistrictRow[] = [];
  await expect
    .poll(async () => {
      rows = await mapTools.districts(page);
      return ready(rows);
    })
    .toBe(true);
  return rows;
}

test.describe('Sidebar matches map state', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeEach(async ({page, request}) => {
    await page.setViewportSize({width: 1280, height: 720});
    // Fresh document per test: the checks compare absolute numbers.
    await navigateToMap(page, await createMapDocument(request));
    await skipWithoutWebMcp(page);
  });

  test('population rows, checklist, and unassigned total follow assignments', async ({page}) => {
    const helper = page.locator('[data-testid="draft-status-helper"]');
    const numDistricts = (await mapTools.state(page)).map.num_districts!;
    await expect(helper).toContainText(`Are all districts started? (0/${numDistricts})`);

    const areas = (await mapTools.loadedAreas(page, 50)).filter(a => a.population > 0);
    expect(areas.length).toBeGreaterThanOrEqual(5);
    await mapTools.assign(
      page,
      areas.slice(0, 3).map(a => a.id),
      1
    );
    await mapTools.assign(
      page,
      areas.slice(3, 5).map(a => a.id),
      2
    );
    const expectedPop = (from: number, to: number) =>
      areas.slice(from, to).reduce((sum, a) => sum + a.population, 0);

    const rows = await districtsWhen(
      page,
      rows => rows.find(r => r.zone === 2)?.assigned_areas === 2
    );
    const pop = (zone: number | null) => rows.find(r => r.zone === zone)!.population;
    expect(pop(1)).toBe(expectedPop(0, 3));
    expect(pop(2)).toBe(expectedPop(3, 5));

    // Population tab: one row per district with its population.
    await expect(page.locator('[data-testid="district-meter-row-1"]')).toContainText(fmt(pop(1)));
    await expect(page.locator('[data-testid="district-meter-row-2"]')).toContainText(fmt(pop(2)));

    // Plan-wide "Unassigned" stat matches the summary's zone-null row.
    const unassigned = page
      .getByText('Unassigned', {exact: true})
      .locator('xpath=following-sibling::*[1]');
    await expect(unassigned).toHaveText(fmt(pop(null)));

    // "Get started" checklist counts started districts and the population left.
    await expect(helper).toContainText(`Are all districts started? (2/${numDistricts})`);
    await expect(helper).toContainText(`(${fmt(pop(null))} left)`);
    await expect(helper.getByRole('button', {name: 'Find unassigned areas'})).toBeVisible();
  });

  test('erasing a district empties its row and returns its population', async ({page}) => {
    const areas = (await mapTools.loadedAreas(page, 50)).filter(a => a.population > 0);
    const ids = areas.slice(0, 3).map(a => a.id);
    await mapTools.assign(page, ids, 3);
    const painted = await districtsWhen(
      page,
      rows => rows.find(r => r.zone === 3)?.assigned_areas === 3
    );
    const unassignedBefore = painted.find(r => r.zone === null)!.population;
    const zone3Pop = painted.find(r => r.zone === 3)!.population;

    await mapTools.assign(page, ids, null);
    const erased = await districtsWhen(
      page,
      rows => rows.find(r => r.zone === 3)?.assigned_areas === 0
    );
    expect(erased.find(r => r.zone === 3)!.population).toBe(0);
    expect(erased.find(r => r.zone === null)!.population).toBe(unassignedBefore + zone3Pop);

    await expect(
      page.getByText('Unassigned', {exact: true}).locator('xpath=following-sibling::*[1]')
    ).toHaveText(fmt(unassignedBefore + zone3Pop));
    await expect(page.locator('[data-testid="draft-status-helper"]')).toContainText(
      'Are all districts started? (0/'
    );
  });
});
