/** Run with `bun test`. */
import {expect, test} from 'bun:test';
import {safeNextPath} from './safeNextPath';

test('keeps same-site paths and their query', () => {
  expect(safeNextPath('/map/edit?document_id=abc')).toBe('/map/edit?document_id=abc');
  expect(safeNextPath('/')).toBe('/');
});

test('falls back to / for anything that could leave the site or loop', () => {
  for (const next of [
    undefined,
    ['/a', '/b'],
    '',
    'map',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/under-construction',
    '/under-construction?next=/x',
  ]) {
    expect(safeNextPath(next)).toBe('/');
  }
});
