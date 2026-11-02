import type {EnsembleChunk, EnsembleMetricsPayload, EnsembleObjective} from './ensembleTypes';

/**
 * The individual-plans section's selection: which plans it shows and which
 * one of them is selected, resolved against the files the modal has.
 *
 * Pure functions only: the section, the modal and their tests share them.
 */

/** Which plans the section shows: one random sample, or one search's plans. */
export type PlanSource = {kind: 'sample'; chunk: number} | {kind: 'extreme'; objective: string};

export const SAMPLE_SOURCE_VALUE = 'sample';

/** The plan the section has settled on, for the charts below it. */
export interface SelectedPlan {
  metrics: EnsembleMetricsPayload;
  /** The sample's plans, when the selected plan is one of a sample. */
  sample?: EnsembleMetricsPayload[];
}

/** The selection, or undefined while its file has not arrived. An index past
 * the end settles on the last plan, so a shorter list never empties it. */
export const selectedPlanOf = (
  source: PlanSource,
  planIndex: number,
  chunk: EnsembleChunk | undefined,
  objectives: EnsembleObjective[]
): SelectedPlan | undefined => {
  if (source.kind === 'sample') {
    if (!chunk || chunk.chunk !== source.chunk || chunk.plans.length === 0) return undefined;
    const plan = chunk.plans[Math.min(planIndex, chunk.plans.length - 1)];
    return {metrics: plan.metrics, sample: chunk.plans.map(p => p.metrics)};
  }
  const objective = objectives.find(o => o.key === source.objective);
  if (!objective || objective.plans.length === 0) return undefined;
  const plan = objective.plans[Math.min(planIndex, objective.plans.length - 1)];
  return plan.metrics ? {metrics: plan.metrics} : undefined;
};

/** A chunk other than `current`, drawn at random; `current` -1 draws any. */
export const anotherChunk = (current: number, count: number): number => {
  if (count < 1) return 0;
  if (current < 0 || current >= count) return Math.floor(Math.random() * count);
  if (count < 2) return current;
  const pick = Math.floor(Math.random() * (count - 1));
  return pick >= current ? pick + 1 : pick;
};
