'use client';
import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '@store/mapStore';
import {useEnsembleStore} from '@store/ensembleStore';
import {
  getEnsembleIndex,
  getEnsembleSummary,
  type EnsembleIndex,
  type EnsemblePreset,
  type EnsembleSummary,
} from '@utils/api/apiHandlers/getEnsemble';
import type {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';

/** Why the panel withholds the comparison, or null when it can show it. */
export type EnsembleBlock = 'incomplete' | 'district-count';

export interface EnsembleReference {
  /** The module has an ensemble package; the preset control belongs on screen. */
  available: boolean;
  index: EnsembleIndex | null;
  preset: EnsemblePreset | null;
  selectPreset: (key: string) => void;
  /** Distributions of the selected preset, once they have arrived. */
  summary: EnsembleSummary | null;
  blocked: EnsembleBlock | null;
  /** Plan values may be placed in the ensemble: popups and the FTV sentence render. */
  active: boolean;
}

/** `assigned_units` accounts for every unit, as the Basics section states it. */
const planIsComplete = (evaluation: DocumentEvaluation): boolean => {
  const units = evaluation.assigned_units;
  if (!units) return false;
  return (
    units.assigned_count + units.split_count === units.total_count &&
    units.partially_assigned_count === 0
  );
};

/** Districts the plan was scored on: the ensemble compares like with like. */
const planDistrictCount = (evaluation: DocumentEvaluation): number | null => {
  const firstElection = Object.values(evaluation.seats ?? {})[0];
  if (firstElection) return firstElection.total;
  const zones = Object.keys(evaluation.polsby_popper ?? {});
  return zones.length || null;
};

/**
 * The ensemble reference frame for the plan being evaluated: the module's
 * package if it has one, the preset the reader selected, and whether this plan
 * may be placed against it.
 *
 * The panel calls this once and hands the result to its sections. Both fetches
 * are react-query cached by module and preset, so switching preset and back
 * costs nothing, and a module with no package is asked for only once.
 */
export const useEnsembleReference = (evaluation: DocumentEvaluation): EnsembleReference => {
  const moduleSlug = useMapStore(state => state.mapDocument?.districtr_map_slug) ?? null;
  const storedPreset = useEnsembleStore(state =>
    moduleSlug ? state.presetByModule[moduleSlug] : undefined
  );
  const setPreset = useEnsembleStore(state => state.setPreset);

  const {data: index = null} = useQuery({
    queryKey: ['ensemble-index', moduleSlug],
    queryFn: () => getEnsembleIndex(moduleSlug!),
    enabled: !!moduleSlug,
    staleTime: Infinity,
    retry: false,
  });

  const presets = index?.presets ?? [];
  const preset =
    presets.find(p => p.key === storedPreset) ?? presets.find(p => p.default) ?? presets[0] ?? null;

  const {data: summary = null} = useQuery({
    queryKey: ['ensemble-summary', moduleSlug, preset?.key],
    queryFn: () => getEnsembleSummary(moduleSlug!, preset!.key),
    enabled: !!moduleSlug && !!preset,
    staleTime: Infinity,
    retry: false,
  });

  const districts = planDistrictCount(evaluation);
  const blocked: EnsembleBlock | null = !planIsComplete(evaluation)
    ? 'incomplete'
    : summary && districts !== null && districts !== summary.num_dists
      ? 'district-count'
      : null;

  return {
    available: !!index && presets.length > 0,
    index,
    preset,
    selectPreset: (key: string) => {
      if (moduleSlug) setPreset(moduleSlug, key);
    },
    summary,
    blocked,
    active: !!summary && !blocked,
  };
};
