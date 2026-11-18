/** Shared site-settings snapshot: throttling and keep-last-value. Run with `bun test`. */
import {afterEach, describe, expect, spyOn, test} from 'bun:test';
import {MIN_GAP_MS, getSiteSettings, refreshSiteSettings} from './siteSettings';

const settings = (message: string) => ({under_construction: true, banner_message: message});
const ok = (body: unknown) => new Response(JSON.stringify(body), {status: 200});

// Module state carries across tests, so each step moves the clock past the gap.
let clock = 1_000_000;
const tick = (ms: number) => (clock += ms);
spyOn(Date, 'now').mockImplementation(() => clock);

describe('refreshSiteSettings', () => {
  const fetchSpy = spyOn(globalThis, 'fetch');
  afterEach(() => fetchSpy.mockReset());

  test('stores the response', async () => {
    fetchSpy.mockResolvedValueOnce(ok(settings('first')));
    await refreshSiteSettings();
    expect(getSiteSettings()).toEqual(settings('first'));
  });

  test('skips a refetch inside the gap, unless the gap is 0', async () => {
    tick(MIN_GAP_MS - 1);
    await refreshSiteSettings();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockResolvedValueOnce(ok(settings('forced')));
    await refreshSiteSettings(0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getSiteSettings()).toEqual(settings('forced'));
  });

  test('keeps the last value on an error status or a network failure', async () => {
    tick(MIN_GAP_MS);
    fetchSpy.mockResolvedValueOnce(new Response('{"detail":"Database error"}', {status: 500}));
    await refreshSiteSettings();
    tick(MIN_GAP_MS);
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await refreshSiteSettings();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(getSiteSettings()).toEqual(settings('forced'));
  });
});
