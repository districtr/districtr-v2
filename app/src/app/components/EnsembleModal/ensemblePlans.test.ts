/**
 * The individual-plans section's selection logic. Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {anotherChunk, selectedPlanOf} from './ensemblePlans';
import type {EnsembleChunk, EnsembleMetricsPayload, EnsembleObjective} from './ensembleTypes';

const metrics = (splits: number) =>
  ({county_splits: {splits, pieces: splits + 1}}) as unknown as EnsembleMetricsPayload;

const chunk: EnsembleChunk = {
  chunk: 4,
  plans: [1, 2, 3].map(i => ({plan: i * 100, assignment: [1, 2], metrics: metrics(i)})),
};

const objective = {
  key: 'county_splits',
  plans: [{metrics: metrics(9)}, {metrics: metrics(8)}],
} as unknown as EnsembleObjective;

describe('selectedPlanOf', () => {
  test('a sampled plan comes with the whole sample', () => {
    const selected = selectedPlanOf({kind: 'sample', chunk: 4}, 1, chunk, []);
    expect(selected?.metrics).toBe(chunk.plans[1].metrics);
    expect(selected?.sample?.length).toBe(3);
  });

  test('a chunk still on its way, or another chunk, selects nothing', () => {
    expect(selectedPlanOf({kind: 'sample', chunk: 4}, 0, undefined, [])).toBeUndefined();
    expect(selectedPlanOf({kind: 'sample', chunk: 5}, 0, chunk, [])).toBeUndefined();
  });

  test('an index past the end settles on the last plan', () => {
    expect(selectedPlanOf({kind: 'sample', chunk: 4}, 10, chunk, [])?.metrics).toBe(
      chunk.plans[2].metrics
    );
  });

  test("a search's plan comes without a sample", () => {
    const selected = selectedPlanOf({kind: 'extreme', objective: 'county_splits'}, 1, undefined, [
      objective,
    ]);
    expect(selected?.metrics).toBe(objective.plans[1].metrics);
    expect(selected?.sample).toBeUndefined();
  });

  test('an unknown search selects nothing', () => {
    expect(
      selectedPlanOf({kind: 'extreme', objective: 'cut_edges'}, 0, undefined, [objective])
    ).toBeUndefined();
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
