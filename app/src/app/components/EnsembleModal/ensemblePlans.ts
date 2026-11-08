import type {EnsembleChunk, EnsembleMetricsPayload} from './ensembleTypes';

/**
 * The individual-plans section's selection: which sampled plan it shows,
 * resolved against the chunk the modal has.
 *
 * Pure functions only: the section, the modal and their tests share them.
 */

/** The plan the section has settled on, for the charts below it. */
export interface SelectedPlan {
  metrics: EnsembleMetricsPayload;
  /** Every plan of the sample the selected plan belongs to. */
  sample: EnsembleMetricsPayload[];
}

/** The selection, or undefined while the chunk has not arrived or is another
 * chunk's. An index past the end settles on the last plan, so a shorter list
 * never empties it. */
export const selectedPlanOf = (
  chunkIndex: number,
  planIndex: number,
  chunk: EnsembleChunk | undefined
): SelectedPlan | undefined => {
  if (!chunk || chunk.chunk !== chunkIndex || chunk.plans.length === 0) return undefined;
  const plan = chunk.plans[Math.min(planIndex, chunk.plans.length - 1)];
  return {metrics: plan.metrics, sample: chunk.plans.map(p => p.metrics)};
};

/** A chunk other than `current`, drawn at random; `current` -1 draws any. */
export const anotherChunk = (current: number, count: number): number => {
  if (count < 1) return 0;
  if (current < 0 || current >= count) return Math.floor(Math.random() * count);
  if (count < 2) return current;
  const pick = Math.floor(Math.random() * (count - 1));
  return pick >= current ? pick + 1 : pick;
};
