/** Inspector tooltip helpers. Run with `bun test`. */
import {describe, expect, test} from 'bun:test';
import {describeHoverUnits, povShare} from './inspector';

const VTD_MAP = {
  child_layer: 'ks_blocks',
  parent_geo_unit_type: 'vtd',
  child_geo_unit_type: 'block',
} as const;
const feature = (sourceLayer: string) => ({source: 'src', sourceLayer});

describe('povShare', () => {
  test('dem POV is the dem share, rep POV its complement', () => {
    expect(povShare(0.23, 'dem')).toBe(0.23);
    expect(povShare(0.23, 'rep')).toBeCloseTo(0.77);
  });

  test('no votes stays NaN for both sides', () => {
    expect(povShare(NaN, 'dem')).toBeNaN();
    expect(povShare(NaN, 'rep')).toBeNaN();
  });
});

describe('describeHoverUnits', () => {
  test('splits parent and child features, singular for one', () => {
    const features = [feature('ks_vtds'), feature('ks_blocks'), feature('ks_blocks')];
    expect(describeHoverUnits(features, VTD_MAP)).toBe('1 VTD · 2 blocks');
  });

  test('plural zero', () => {
    expect(describeHoverUnits([feature('ks_blocks')], VTD_MAP)).toBe('0 VTDs · 1 block');
  });

  test('maps without a child layer count only parents', () => {
    const bgMap = {
      child_layer: null,
      parent_geo_unit_type: 'bg',
      child_geo_unit_type: null,
    } as const;
    expect(describeHoverUnits([feature('a'), feature('b')], bgMap)).toBe('2 block groups');
  });

  test('empty without a parent unit type', () => {
    const noType = {...VTD_MAP, parent_geo_unit_type: null as unknown as 'vtd'};
    expect(describeHoverUnits([feature('ks_vtds')], noType)).toBe('');
    expect(describeHoverUnits([], null)).toBe('');
  });
});
