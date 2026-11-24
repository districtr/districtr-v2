import {expect, test} from 'bun:test';
import exemplars from './compactnessExemplars.json';

const SCORE_KEYS = ['polsby_popper', 'reock'] as const;
const buckets = SCORE_KEYS.flatMap(scoreKey => exemplars.buckets[scoreKey]);
const districts: Record<string, unknown> = exemplars.districts;

test('every range has its two edges in order', () => {
  for (const {min, max} of buckets) {
    expect(typeof min).toBe('number');
    expect(typeof max).toBe('number');
    expect(min).toBeLessThan(max);
  }
});

test('both scores have the same ranges', () => {
  const edges = (scoreKey: (typeof SCORE_KEYS)[number]) =>
    exemplars.buckets[scoreKey].map(({min, max}) => [min, max]);
  expect(edges('reock')).toEqual(edges('polsby_popper'));
});

test('every sampled district has an outline, and every outline is sampled', () => {
  const sampled = new Set(buckets.flatMap(bucket => bucket.districts));
  expect([...sampled].filter(geoid => !(geoid in districts))).toEqual([]);
  expect(Object.keys(districts).filter(geoid => !sampled.has(geoid))).toEqual([]);
});

test('a sample holds the sample size, or the whole range when the range is smaller', () => {
  for (const bucket of buckets) {
    expect(bucket.districts.length).toBe(Math.min(exemplars.sampleSize, bucket.total));
    expect(new Set(bucket.districts).size).toBe(bucket.districts.length);
  }
});
