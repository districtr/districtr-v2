import {describe, expect, test} from 'bun:test';
import {
  aliasesForCount,
  byZoneOrder,
  cleanZoneLabel,
  findLabelConflict,
  isDigitLabel,
  moveZoneInOrder,
  normalizeZoneOrder,
  zoneLabel,
} from './zoneLabels';

describe('zone labels', () => {
  test('a district without a stored label shows its number', () => {
    expect(zoneLabel(3, {'1': 'North'})).toBe('3');
    expect(zoneLabel(1, {'1': 'North'})).toBe('North');
    expect(zoneLabel(2, null)).toBe('2');
  });

  test('cleaning matches the server: sanitized, capped by code point', () => {
    expect(cleanZoneLabel(' North <b>Shore</b> ')).toBe('North Shore');
    // The three characters the client and server sanitizers used to disagree on:
    // U+001F and U+0085 are whitespace (Python's str.isspace), U+FEFF is a
    // format character and is dropped. backend/tests/test_zone_labels.py
    // checks the same strings.
    expect(cleanZoneLabel('North\u001fShore')).toBe('North Shore');
    expect(cleanZoneLabel('North\u0085Shore')).toBe('North Shore');
    expect(cleanZoneLabel('North\ufeffShore')).toBe('NorthShore');
    // 39 letters then emoji: a UTF-16 slice at 40 would leave half an emoji.
    expect(cleanZoneLabel('a'.repeat(39) + '😀😀')).toBe('a'.repeat(39) + '😀');
  });

  test('labels must be unique, case-insensitively, defaults included', () => {
    // Naming district 1 "3" while district 3 still shows "3".
    expect(findLabelConflict(1, '3', {}, 4)).toBe(3);
    expect(findLabelConflict(1, 'north', {'2': 'North'}, 4)).toBe(2);
    // Resetting district 3 to its number while district 1 is labeled "3".
    expect(findLabelConflict(3, '', {'1': '3'}, 4)).toBe(1);
    // A label past the district count doesn't count.
    expect(findLabelConflict(1, '5', {}, 4)).toBeNull();
    expect(findLabelConflict(2, 'North', {'2': 'North'}, 4)).toBeNull();
  });

  test('a new district whose number is taken gets the smallest free one', () => {
    // District 1 is labeled "5"; adding district 5 can't default to "5".
    expect(aliasesForCount({'1': '5'}, 4, 5)).toEqual({'1': '5', '5': '1'});
    // Labels past a lowered count go.
    expect(aliasesForCount({'1': 'A', '4': 'D'}, 4, 3)).toEqual({'1': 'A'});
  });

  test('only all-digit labels are shortcuts', () => {
    expect(isDigitLabel('14')).toBe(true);
    expect(isDigitLabel('North')).toBe(false);
    expect(isDigitLabel('１')).toBe(false);
  });
});

describe('zone order', () => {
  test('is cleaned on read', () => {
    expect(normalizeZoneOrder(undefined, 3)).toEqual([1, 2, 3]);
    // Out of range and repeats drop; missing districts append in numeric order.
    expect(normalizeZoneOrder([3, 9, 3, 0, 1], 4)).toEqual([3, 1, 2, 4]);
    expect(normalizeZoneOrder([4, 3, 2, 1], 2)).toEqual([2, 1]);
  });

  test('a move is a plain list reorder', () => {
    expect(moveZoneInOrder([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(moveZoneInOrder([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
    expect(moveZoneInOrder([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
  });

  test('sorts districts by panel position', () => {
    expect([1, 2, 3, 4].sort(byZoneOrder([3, 1, 4, 2]))).toEqual([3, 1, 4, 2]);
  });
});
