import {test, expect, type Browser, type Page} from '@playwright/test';
import {skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap, waitForMapSettled} from '../../fixtures/map-fixture';
import {mapTools, assignedIn, skipWithoutWebMcp, type Area} from '../../utils/webmcp';

/**
 * Two browsers editing one map. Each browser context has its own IndexedDB copy, so
 * contexts stand in for two devices. The server rejects a save whose last_updated_at
 * is stale (409), which opens the save-conflict modal; a load whose cached updated_at
 * no longer matches the server's opens the same modal from the load path.
 */

const VIEWPORT = {width: 1280, height: 720};

// ponytail: local helpers; promote to e2e/utils if other specs need multi-device setups.

/** A fresh browser on a document id, or on a full edit URL (clones use a private edit token). */
async function openTab(browser: Browser, documentIdOrUrl: string): Promise<Page> {
  const context = await browser.newContext({viewport: VIEWPORT});
  const page = await context.newPage();
  if (documentIdOrUrl.startsWith('http')) {
    await page.goto(documentIdOrUrl);
    await waitForMapSettled(page);
  } else {
    await navigateToMap(page, documentIdOrUrl);
  }
  await skipWithoutWebMcp(page);
  return page;
}

/** Two unassigned areas both tabs can see (same document, same tiles). */
async function twoAreas(page: Page): Promise<[string, string]> {
  const areas = (await mapTools.loadedAreas(page, 500)).filter(a => a.zone === null);
  expect(areas.length).toBeGreaterThanOrEqual(2);
  return [areas[0].id, areas[1].id];
}

async function paint(page: Page, id: string, zone: number) {
  expect(await mapTools.assign(page, [id], zone)).toMatchObject({assigned: 1});
  await expect.poll(() => assignedIn(page, zone)).toBeGreaterThan(0);
}

async function save(page: Page) {
  const saveButton = page.locator('[data-testid="save-button"]');
  await expect(saveButton).toHaveAttribute('aria-label', 'Save changes');
  await saveButton.click();
}

const conflictModal = (page: Page) => page.getByRole('dialog', {name: 'Save Conflict Detected'});

/** Zone of each area as the page currently holds it. */
async function zonesOf(page: Page, ids: string[]) {
  const areas: unknown = await mapTools.loadedAreas(page, 5000);
  // Right after a reload the tool answers {error: 'Map is not loaded yet.'}; report
  // "unknown" so expect.poll keeps waiting instead of crashing.
  if (!Array.isArray(areas)) return ids.map(() => 'not loaded');
  return ids.map(id => {
    const area = (areas as Area[]).find(a => a.id === id);
    // Distinguish "not in the loaded tiles" from "unassigned" (null).
    return area ? area.zone : 'not loaded';
  });
}

/** What the server kept: a fresh context has no IndexedDB copy to merge. */
async function serverZones(browser: Browser, documentIdOrUrl: string, ids: string[]) {
  const page = await openTab(browser, documentIdOrUrl);
  const zones = await zonesOf(page, ids);
  await page.context().close();
  return zones;
}

/** Wait until this context's IndexedDB copy records an unsaved local edit. */
async function waitForLocalEdit(page: Page, documentId: string) {
  await expect
    .poll(() =>
      page.evaluate(
        id =>
          new Promise<boolean>(resolve => {
            const open = indexedDB.open('DocumentsDB');
            open.onsuccess = () => {
              const get = open.result.transaction('documents').objectStore('documents').get(id);
              get.onsuccess = () => {
                const doc = get.result;
                open.result.close();
                resolve(!!doc && doc.clientLastUpdated !== doc.document_metadata?.updated_at);
              };
              get.onerror = () => resolve(false);
            };
            open.onerror = () => resolve(false);
          }),
        documentId
      )
    )
    .toBe(true);
}

test.describe('Sync conflicts between two browsers', () => {
  test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');
  // Each test drives two to four browser contexts against one map.
  test.slow();

  let documentId: string;
  let a: Page;
  let b: Page;
  let x: string;
  let y: string;

  // Every test: A and B open the same fresh map; A paints x into district 1 and saves.
  // B's copy is now stale.
  test.beforeEach(async ({browser, request}) => {
    documentId = await createMapDocument(request);
    a = await openTab(browser, documentId);
    b = await openTab(browser, documentId);
    [x, y] = await twoAreas(a);
    await paint(a, x, 1);
    await save(a);
    await expect(a.locator('[data-testid="save-button"]')).toHaveAttribute(
      'aria-label',
      'All changes saved'
    );
  });

  test.afterEach(async () => {
    await a?.context().close();
    await b?.context().close();
  });

  test('saving a stale copy opens the conflict modal; "use this version" overwrites the cloud', async ({
    browser,
  }) => {
    await paint(b, y, 2);
    await save(b);
    const modal = conflictModal(b);
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Local Version', {exact: true})).toBeVisible();
    await expect(modal.getByText('Cloud Version', {exact: true})).toBeVisible();

    await modal.getByRole('button', {name: /Use this version/}).click();
    await expect(modal).toBeHidden();
    await expect(b.locator('[data-testid="save-button"]')).toHaveAttribute(
      'aria-label',
      'All changes saved'
    );
    // B's copy never had x, so the cloud now has only B's edit.
    expect(await serverZones(browser, documentId, [x, y])).toEqual([null, 2]);
  });

  test('"use the cloud version" discards local edits and loads the other browser\'s save', async ({
    browser,
  }) => {
    await paint(b, y, 2);
    await save(b);
    await conflictModal(b)
      .getByRole('button', {name: /Use the cloud version/})
      .click();
    await expect(conflictModal(b)).toBeHidden();

    await expect.poll(() => zonesOf(b, [x, y])).toEqual([1, null]);
    expect(await serverZones(browser, documentId, [x, y])).toEqual([1, null]);
  });

  test('"clone this version" keeps both: the clone has local edits, the original keeps the cloud save', async ({
    browser,
  }) => {
    await paint(b, y, 2);
    await save(b);
    const originalUrl = b.url();
    await conflictModal(b)
      .getByRole('button', {name: /Clone this version/})
      .click();
    await expect(conflictModal(b)).toBeHidden();
    await expect.poll(() => b.url()).not.toBe(originalUrl);
    // Client-side navigation: the page still shows B's in-memory copy, so check the clone
    // on the server from a fresh context. The fork uploads B's local assignments with
    // overwrite, so x (only in the cloud copy) is dropped.
    // The clone's edit URL carries its private edit token; open it as-is.
    expect(b.url()).not.toContain(documentId);
    expect(await serverZones(browser, b.url(), [x, y])).toEqual([null, 2]);
    expect(await serverZones(browser, documentId, [x, y])).toEqual([1, null]);
  });

  test('"deal with this later" keeps local edits unsaved', async () => {
    await paint(b, y, 2);
    await save(b);
    await conflictModal(b)
      .getByRole('button', {name: /deal with this later/})
      .click();
    await expect(conflictModal(b)).toBeHidden();
    expect(await zonesOf(b, [x, y])).toEqual([null, 2]);
    await expect(b.locator('[data-testid="save-button"]')).toHaveAttribute(
      'aria-label',
      'Save changes'
    );
  });

  test('reloading a copy with unsaved edits after another browser saved opens the conflict modal', async ({
    browser,
  }) => {
    await paint(b, y, 2);
    await waitForLocalEdit(b, documentId);
    await b.reload();
    const modal = conflictModal(b);
    await expect(modal).toBeVisible({timeout: 45_000});

    await modal.getByRole('button', {name: /Use this version/}).click();
    await expect(modal).toBeHidden();
    await expect.poll(() => zonesOf(b, [x, y])).toEqual([null, 2]);
    expect(await serverZones(browser, documentId, [x, y])).toEqual([null, 2]);
  });

  // fixme: fetchDocument declares a conflict whenever the cached updated_at is stale, before
  // checking clientHasNoEdits, so a copy with no edits gets "You have unsaved changes".
  test.fixme('reloading a copy with no local edits just loads the newer cloud save', async () => {
    await b.reload();
    await expect(b.locator('[data-testid="map-container"][data-app-state="loaded"]')).toBeVisible({
      timeout: 45_000,
    });
    await expect(conflictModal(b)).toBeHidden();
    await expect.poll(() => zonesOf(b, [x])).toEqual([1]);
  });
});
