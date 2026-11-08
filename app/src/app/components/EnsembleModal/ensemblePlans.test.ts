/**
 * The individual-plans section's selection logic. Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {anotherChunk, selectedPlanOf} from './ensemblePlans';
import type {EnsembleChunk, EnsembleMetricsPayload} from './ensembleTypes';

const metrics = (splits: number) =>
  ({county_splits: {splits, pieces: splits + 1}}) as unknown as EnsembleMetricsPayload;

const chunk: EnsembleChunk = {
  chunk: 4,
  plans: [1, 2, 3].map(i => ({plan: i * 100, assignment: [1, 2], metrics: metrics(i)})),
};

describe('selectedPlanOf', () => {
  test('a sampled plan comes with the whole sample', () => {
    const selected = selectedPlanOf(4, 1, chunk);
    expect(selected?.metrics).toBe(chunk.plans[1].metrics);
    expect(selected?.sample.length).toBe(3);
  });

  test('a chunk still on its way, or another chunk, selects nothing', () => {
    expect(selectedPlanOf(4, 0, undefined)).toBeUndefined();
    expect(selectedPlanOf(5, 0, chunk)).toBeUndefined();
  });

  test('an index past the end settles on the last plan', () => {
    expect(selectedPlanOf(4, 10, chunk)?.metrics).toBe(chunk.plans[2].metrics);
  });
});

describe('anotherChunk', () => {
  test('never returns the current chunk when there is another', () => {
    for (let i = 0; i < 50; i++) {
      const next = anotherChunk(2, 3);
      expect(next).not.toBe(2);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(3);
    }
  });

  test('a single chunk is its own alternative', () => {
    expect(anotherChunk(0, 1)).toBe(0);
  });

  test('no current chunk draws any of them', () => {
    for (let i = 0; i < 20; i++) {
      const pick = anotherChunk(-1, 4);
      expect(pick).toBeGreaterThanOrEqual(0);
      expect(pick).toBeLessThan(4);
    }
  });
});
