/** Shared site-settings snapshot: throttling, keep-last-value, per-load flags, and the poller. Run with `bun test`. */
import {afterAll, afterEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {MIN_GAP_MS, POLL_MS, getSiteSettings, refreshSiteSettings, subscribe} from './siteSettings';

const settings = (message: string, feature_flags = {}) => ({
  under_construction: true,
  banner_message: message,
  downtime_at: null,
  feature_flags,
});
const ok = (body: unknown) => new Response(JSON.stringify(body), {status: 200});

// Module state carries across tests, so each step moves the clock past the gap.
let clock = 1_000_000;
const tick = (ms: number) => (clock += ms);
spyOn(Date, 'now').mockImplementation(() => clock);
const fetchSpy = spyOn(globalThis, 'fetch');
afterEach(() => fetchSpy.mockReset());
// Don't leak the fake clock and fetch into other test files.
afterAll(() => mock.restore());

describe('refreshSiteSettings', () => {
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

  test('feature flags hold for the page load while the rest updates', async () => {
    tick(MIN_GAP_MS);
    fetchSpy.mockResolvedValueOnce(ok(settings('later', {tuningView: false})));
    await refreshSiteSettings();
    expect(getSiteSettings()).toEqual(settings('later'));
  });
});

describe('subscribe', () => {
  // Minimal browser stand-ins: bun has no DOM.
  const handlers = new Map<string, () => void>();
  const target = {
    addEventListener: (type: string, fn: () => void) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
  };
  Object.assign(globalThis, {
    document: {...target, visibilityState: 'visible'},
    window: target,
  });
  afterAll(() => {
    delete (globalThis as {document?: unknown}).document;
    delete (globalThis as {window?: unknown}).window;
  });

  test('notifies on a fetch, polls inside the gap on the interval, and stops on the last unsubscribe', async () => {
    let poll: () => void = () => {};
    const setIntervalSpy = spyOn(globalThis, 'setInterval').mockImplementation(((
      fn: () => void,
      ms: number
    ) => {
      expect(ms).toBe(POLL_MS);
      poll = fn;
      return 1;
    }) as unknown as typeof setInterval);
    const clearIntervalSpy = spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
    const listener = mock(() => {});

    tick(MIN_GAP_MS);
    fetchSpy.mockResolvedValueOnce(ok(settings('on subscribe')));
    const unsubscribe = subscribe(listener);
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSiteSettings()).toEqual(settings('on subscribe'));

    // The interval fetches even though the last fetch was under the gap ago.
    fetchSpy.mockResolvedValueOnce(ok(settings('from the interval')));
    poll();
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSiteSettings()).toEqual(settings('from the interval'));

    unsubscribe();
    expect(clearIntervalSpy).toHaveBeenCalledWith(1);
    expect(handlers.size).toBe(0);
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
