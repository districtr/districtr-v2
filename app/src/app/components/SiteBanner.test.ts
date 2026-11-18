/** Countdown wording. Run with `bun test`. */
import {expect, test} from 'bun:test';
import {COUNTDOWN_GRACE_MS, downtimeIn} from './SiteBanner';

test('downtimeIn rounds up, bottoms out at "any moment now", then drops off', () => {
  expect(downtimeIn(10 * 60_000)).toBe('in 10 minutes');
  expect(downtimeIn(9 * 60_000 + 1)).toBe('in 10 minutes');
  expect(downtimeIn(90_000)).toBe('in 2 minutes');
  expect(downtimeIn(30_000)).toBe('in about a minute');
  expect(downtimeIn(0)).toBe('any moment now');
  expect(downtimeIn(-60_000)).toBe('any moment now');
  expect(downtimeIn(-COUNTDOWN_GRACE_MS)).toBe('any moment now');
  expect(downtimeIn(-COUNTDOWN_GRACE_MS - 1)).toBeNull();
});
