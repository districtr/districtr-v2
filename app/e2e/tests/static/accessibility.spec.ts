import {test, expect, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {testUrls, skipConditions} from '../../fixtures/test-data';
import {createMapDocument, navigateToMap} from '../../fixtures/map-fixture';

/**
 * axe-core WCAG 2.x A/AA scan of the main pages. Fails on serious/critical
 * violations that aren't in KNOWN below; every violation (any impact) is
 * attached to the report as JSON.
 *
 * KNOWN is the backlog as of 2026-10-22, by page and axe rule id. Fix one,
 * then delete it here; the test notes stale entries so the list only shrinks.
 */
const KNOWN: Record<string, string[]> = {
  home: ['aria-allowed-attr', 'button-name', 'color-contrast', 'link-in-text-block'],
  about: ['aria-allowed-attr', 'color-contrast', 'link-in-text-block'],
  guide: ['aria-allowed-attr', 'color-contrast'],
  places: ['aria-allowed-attr', 'color-contrast'],
  place: ['aria-allowed-attr', 'color-contrast', 'label-content-name-mismatch'],
  editor: ['aria-input-field-name', 'button-name', 'color-contrast', 'label-content-name-mismatch'],
};

async function scan(page: Page, name: string, exclude: string[] = []) {
  let builder = new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  for (const selector of exclude) builder = builder.exclude(selector);
  const {violations} = await builder.analyze();
  await test.info().attach(`axe-${name}.json`, {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
  const serious = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  const known = new Set(KNOWN[name] ?? []);
  const stale = [...known].filter(id => !serious.some(v => v.id === id));
  if (stale.length) {
    test
      .info()
      .annotations.push({type: 'fixed', description: `Remove from KNOWN.${name}: ${stale}`});
  }
  // One line per new rule so a failure reads as a to-do list.
  return serious
    .filter(v => !known.has(v.id))
    .map(v => `${v.impact} ${v.id} (${v.nodes.length}): ${v.help} — ${v.nodes[0]?.target}`);
}

const staticPages: Array<[string, string]> = [
  ['home', testUrls.home],
  ['about', testUrls.about],
  ['guide', testUrls.guide],
  ['places', testUrls.places],
];

test.describe('Accessibility (axe)', () => {
  for (const [name, url] of staticPages) {
    test(`${name} page has no new serious violations`, async ({page}) => {
      await page.goto(url);
      await page.getByRole('heading').first().waitFor();
      expect(await scan(page, name)).toEqual([]);
    });
  }

  test('place page has no new serious violations', async ({page}) => {
    await page.goto(testUrls.places);
    await page.locator('a[href*="/place/"]').first().click();
    await page.locator('button[aria-label^="Start a new district plan"]').first().waitFor();
    expect(await scan(page, 'place')).toEqual([]);
  });

  test('map editor has no new serious violations', async ({page, request}) => {
    test.skip(skipConditions.requiresWriteAccess(), 'Requires write access');
    await page.setViewportSize({width: 1280, height: 720});
    await navigateToMap(page, await createMapDocument(request));
    // The WebGL canvas is opaque to axe; the WebMCP tools are its non-visual interface.
    expect(await scan(page, 'editor', ['.maplibregl-canvas'])).toEqual([]);
  });
});
