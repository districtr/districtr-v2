'use client';
import {Dialog, Text} from '@radix-ui/themes';
import type {EnsemblePreset, EnsembleSummary} from '@utils/api/apiHandlers/getEnsemble';
import type {EnsembleMetricRef} from '@utils/ensembleStats';

/**
 * "About these plans": methodology, a walk through a hundred example plans, and
 * the histogram of the ensemble for one metric.
 *
 * The panel mounts this once and keeps it mounted, so everything it reads
 * beyond `summary` — the segment of example plans and their thumbnails — is
 * fetched only while `open`.
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
}

export const EnsembleModal: React.FC<EnsembleModalProps> = ({open, onOpenChange, preset}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Content>
      <Dialog.Title>About these plans</Dialog.Title>
      <Text size="2" color="gray">
        {preset.label}
      </Text>
    </Dialog.Content>
  </Dialog.Root>
);
