/**
 * parseMapRef builds the map_ref the backend clones into a submission, so it
 * is a cross-service payload (see the testing policy). Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {expandUUID, parseMapRef, shortenUUID} from './editUrl';

const BASE = 'https://districtr.org/portal/example';
const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER = '00000000-0000-4000-8000-000000000000';

describe('parseMapRef', () => {
  test('bare ids pass through', () => {
    expect(parseMapRef('1234')).toBe('1234');
    expect(parseMapRef(`  ${UUID}  `)).toBe(UUID);
  });

  test('edit link resolves to the public id in the path', () => {
    const link = `https://districtr.org/map/1234/edit?private_edit_id=${shortenUUID(UUID)}`;
    expect(parseMapRef(link, BASE)).toBe('1234');
  });

  test('a damaged token that still decodes cannot redirect an edit link', () => {
    // A corrupted token can decode to a well-formed UUID for another
    // document; the path's public id must win so the right map is cloned.
    const damaged = shortenUUID(OTHER);
    expect(expandUUID(damaged)).toBe(OTHER);
    const link = `https://districtr.org/map/1234/edit?private_edit_id=${damaged}`;
    expect(parseMapRef(link, BASE)).toBe('1234');
  });

  test('token is used when the path has no public id', () => {
    const link = `https://districtr.org/map/edit?private_edit_id=${shortenUUID(UUID)}`;
    expect(parseMapRef(link, BASE)).toBe(UUID);
  });

  test('undecodable token falls back to a UUID path segment', () => {
    expect(
      parseMapRef(`https://districtr.org/map/${UUID}/edit?private_edit_id=garbage`, BASE)
    ).toBe(UUID);
  });

  test('read links, eval links and relative paths', () => {
    expect(parseMapRef('https://districtr.org/map/1234', BASE)).toBe('1234');
    expect(parseMapRef('https://districtr.org/map/1234/eval', BASE)).toBe('1234');
    expect(parseMapRef('/map/1234?pw=true', BASE)).toBe('1234');
  });

  test('unparseable input is null', () => {
    expect(parseMapRef('', BASE)).toBeNull();
    expect(parseMapRef('https://districtr.org/about', BASE)).toBeNull();
    expect(parseMapRef('not a link at all', BASE)).toBeNull();
  });
});
