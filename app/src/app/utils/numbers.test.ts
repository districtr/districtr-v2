/**
 * Signed deviation formatters shared by the population bars and the tuning
 * table. Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {signedNumber, signedPercent} from './numbers';

describe('signed deviation formatters', () => {
  test('use a Unicode minus below ideal and + at or above it', () => {
    expect(signedNumber(-3047)).toBe('−3,047');
    expect(signedNumber(679)).toBe('+679');
    expect(signedNumber(0)).toBe('+0');
  });

  test('percent of ideal at chart precision', () => {
    expect(signedPercent(-980, 734470)).toBe('−0.1%');
  });
});
