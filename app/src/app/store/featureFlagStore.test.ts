/** Flag precedence: override, then CMS, then default. Run with `bun test`. */
import {describe, expect, test} from 'bun:test';
import {resolveFlag} from './featureFlagStore';

describe('resolveFlag', () => {
  test('defaults on when neither the CMS nor an override sets it', () => {
    expect(resolveFlag('tuningView', undefined, undefined)).toBe(true);
    expect(resolveFlag('tuningView', undefined, {districtFocus: false})).toBe(true);
  });
  test('the CMS beats the default, an override beats the CMS', () => {
    expect(resolveFlag('tuningView', undefined, {tuningView: false})).toBe(false);
    expect(resolveFlag('tuningView', true, {tuningView: false})).toBe(true);
    expect(resolveFlag('tuningView', false, undefined)).toBe(false);
  });
});
