'use client';
import {
  EnsembleModal as EnsembleModalDialog,
  type EnsembleMetricFocus,
} from '@components/EnsembleModal';
import type {EnsemblePreset, EnsembleSummary} from '@utils/api/apiHandlers/getEnsemble';
import type {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import type {EnsembleMetricRef} from '@utils/ensembleStats';

/**
 * "About these plans": methodology, a walk through a hundred example plans, and
 * the histogram of the ensemble for one metric.
 *
 * The panel names a series by the reference its own cells carry; the dialog
 * names one by category and metric id. This module is the translation between
 * the two, and the only place the panel reaches into the dialog.
 *
 * The panel mounts this once and keeps it mounted, so everything the dialog
 * reads beyond the summary — the segment of example plans and their thumbnails
 * — is fetched only while `open`.
 */
export interface EnsembleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleSlug: string;
  /** The preset the panel is comparing against. */
  preset: EnsemblePreset;
  /** Distributions of that preset, null until they arrive. */
  summary: EnsembleSummary | null;
  /** The metric to open on, from the cell the reader came from; null opens on the default. */
  metric: EnsembleMetricRef | null;
  /** The reader's own plan, which the histogram marks against the ensemble. */
  evaluation?: DocumentEvaluation;
}

/** Plan-level series sit in the category the dialog files them under. */
const PLAN_METRIC_CATEGORY = {
  n_dem_districts: 'competitiveness',
  n_rep_districts: 'competitiveness',
  n_swing_districts: 'competitiveness',
  n_competitive_contests: 'competitiveness',
  county_splits: 'splits',
  county_pieces: 'splits',
  cut_edges: 'compactness',
} as const;

/**
 * The dialog charts one aggregate at a time, so a reference to the whole
 * per-district spread opens on its mean.
 */
const toFocus = (ref: EnsembleMetricRef | null): EnsembleMetricFocus | null => {
  if (!ref) return null;
  switch (ref.kind) {
    case 'election':
      return {category: 'partisan', metric: ref.metric, election: ref.election};
    case 'plan':
      return {category: PLAN_METRIC_CATEGORY[ref.metric], metric: ref.metric};
    case 'compactness': {
      const aggregate = ref.aggregate === 'districts' ? 'mean' : ref.aggregate;
      return {category: 'compactness', metric: `${ref.metric}_${aggregate}`};
    }
  }
};

export const EnsembleModal: React.FC<EnsembleModalProps> = ({
  open,
  onOpenChange,
  moduleSlug,
  preset,
  metric,
  evaluation,
}) => (
  <EnsembleModalDialog
    open={open}
    onOpenChange={onOpenChange}
    moduleSlug={moduleSlug}
    presetKey={preset.key}
    presetLabel={preset.label}
    nPlans={preset.n_plans}
    focus={toFocus(metric)}
    evaluation={evaluation}
  />
);
