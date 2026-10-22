import {test, expect, type Page, type APIRequestContext} from '@playwright/test';
import {testConfig, testSelectors, skipConditions} from '../../fixtures/test-data';
import {getMapCenter, paintAtCoordinates} from '../../utils/map-helpers';

/**
 * Community (COI) maps. The COI editor renders CoiMap/CoiMapContainer, which carry
 * neither the readiness attributes (data-testid="map-container", data-app-state,
 * data-render-state, data-idle) nor the WebMCP tools (only MainMap registers them),
 * so this spec waits on UI state: the Paint button enables once the document loads
 * with edit access, and the Demographics table shows each community's population.
 */

// ponytail: local helpers; promote to e2e/utils if COI specs grow.

async function createCommunityMap(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${testConfig.backendURL}/api/create_document`, {
    data: {districtr_map_slug: testConfig.testMapSlug, map_type: 'community'},
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).document_id;
}

/** Open a community map's editor and wait until it can be painted. */
async function openCommunityMap(page: Page, documentId: string): Promise<void> {
  await page.goto(`/coi/${documentId}/edit`);
  await expect(page.getByRole('button', {name: 'Paint', exact: true})).toBeEnabled({
    timeout: testConfig.timeoutMultiplier * 45_000,
  });
}

/** The community picker (shares data-testid="zone-picker" with the district picker). */
const picker = (page: Page) => page.locator(testSelectors.zonePicker);

/** The community's Total cell in the sidebar Demographics table ("--" when unpainted). */
function communityTotal(page: Page, renderOrder: number) {
  return page
    .locator('[data-testid="sidebar"] table')
    .getByRole('row')
    .filter({has: page.getByRole('cell', {name: String(renderOrder), exact: true})})
    .getByRole('cell')
    .last();
}

/**
 * Click-paint until the community's population shows. Without a COI readiness signal
 * the first click can land before tiles render, so retry the (idempotent) paint.
 */
async function paintCommunity(page: Page, renderOrder: number, x: number, y: number) {
  await expect(async () => {
    await paintAtCoordinates(page, x, y);
    await expect(communityTotal(page, renderOrder)).not.toHaveText('--', {timeout: 2_000});
  }).toPass({timeout: 30_000});
}

async function editCommunity(page: Page, rowName: string, name: string, description: string) {
  await page
    .getByRole('radiogroup')
    .locator('div', {hasText: rowName})
    .getByRole('button', {name: 'Edit community'})
    .first()
    .click();
  const dialog = page.getByRole('dialog', {name: 'Edit Community'});
  await dialog.getByLabel('Community Name').fill(name);
  await dialog.getByLabel('Description').fill(description);
  await dialog.getByRole('button', {name: 'Save Changes'}).click();
  await expect(dialog).toBeHidden();
}

test.describe('Community maps', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');

  test.beforeEach(async ({page}) => {
    await page.setViewportSize({width: 1280, height: 720});
  });

  test('a place page starts a community map in the community editor', async ({page}) => {
    await page.goto('/place/alabama');
    await page
      .getByRole('button', {name: /^Start a new community map:/})
      .first()
      .click();
    await page.waitForURL(/\/coi\/[^/]+\/edit/);
    await expect(page.getByRole('button', {name: 'Paint', exact: true})).toBeEnabled({
      timeout: 45_000,
    });
    // A new community map starts with one community and the brush ready.
    await expect(picker(page).getByText('Community 1', {exact: true})).toBeVisible();
    await expect(page.locator(testSelectors.brushTool)).toHaveAttribute('aria-pressed', 'true');
  });

  test('paints, names, and saves communities that load in a fresh browser', async ({
    page,
    browser,
    request,
  }) => {
    const documentId = await createCommunityMap(request);
    await openCommunityMap(page, documentId);
    const c = await getMapCenter(page);

    // Community 1: paint (paint-by-county is on by default), then name and describe it.
    await paintCommunity(page, 1, c.x, c.y);
    // The Demographics table shows the selected community only.
    const total1 = await communityTotal(page, 1).textContent();
    await editCommunity(page, 'Community 1', 'Riverside', 'Neighborhoods along the river');
    await expect(picker(page).getByText('Riverside', {exact: true})).toBeVisible();

    // Community 2: added from the picker, selected, painted elsewhere.
    await page.getByRole('button', {name: 'Start drawing a new community'}).click();
    await expect(picker(page).getByRole('radiogroup').getByRole('radio')).toHaveCount(2);
    await expect(picker(page).getByRole('radiogroup').getByRole('radio').nth(1)).toBeChecked();
    await paintCommunity(page, 2, c.x - 150, c.y + 120);
    const total2 = await communityTotal(page, 2).textContent();

    const saveButton = page.locator('[data-testid="save-button"]');
    await expect(saveButton).toHaveAttribute('aria-label', 'Save changes');
    await saveButton.click();
    await expect(saveButton).toHaveAttribute('aria-label', 'All changes saved');

    // A fresh context has no IndexedDB copy, so this is what the server kept.
    const context = await browser.newContext({viewport: {width: 1280, height: 720}});
    const fresh = await context.newPage();
    await openCommunityMap(fresh, documentId);
    await expect(picker(fresh).getByText('Riverside', {exact: true})).toBeVisible();
    await expect(picker(fresh).getByText('Neighborhoods along the river')).toBeVisible();
    await expect(picker(fresh).getByRole('radiogroup').getByRole('radio')).toHaveCount(2);
    const radios = picker(fresh).getByRole('radiogroup').getByRole('radio');
    await radios.nth(0).click();
    await expect(communityTotal(fresh, 1)).toHaveText(total1!);
    await radios.nth(1).click();
    await expect(communityTotal(fresh, 2)).toHaveText(total2!);
    await context.close();
  });

  test('a district map opened in the community editor is refused', async ({page, request}) => {
    const response = await request.post(`${testConfig.backendURL}/api/create_document`, {
      data: {districtr_map_slug: testConfig.testMapSlug},
    });
    const {document_id} = await response.json();
    await page.goto(`/coi/${document_id}/edit`);
    await expect(page.getByText(/not a community map/i)).toBeVisible({timeout: 45_000});
  });
});
