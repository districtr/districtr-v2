'use client';
import React from 'react';
import {Button, Callout, Flex, Slider, Spinner, Text} from '@radix-ui/themes';
import {InfoCircledIcon, ShuffleIcon} from '@radix-ui/react-icons';
import type {EnsembleMetricFocus} from './ensembleMetrics';
import {ENSEMBLE_MODAL_TEXT, fillEnsembleText} from './ensembleModalText';
import {anotherChunk, selectedPlanOf} from './ensemblePlans';
import {PlanThumbnail} from './PlanThumbnail';
import {SegmentTables} from './SegmentTables';
import type {EnsembleChunk, EnsembleGeometry} from './ensembleTypes';

export interface PlanSectionProps {
  presetLabel: string;
  planCountText: string;
  /** Number of chunks the package holds. */
  chunkCount: number;
  /** The chunk whose plans the section shows. */
  chunkIndex: number;
  onChunkChange: (chunk: number) => void;
  planIndex: number;
  onPlanIndexChange: (index: number) => void;
  chunk?: EnsembleChunk;
  chunkLoading: boolean;
  chunkFailed: boolean;
  geometry?: EnsembleGeometry | null;
  focus: EnsembleMetricFocus;
  onSelectMetric: (focus: EnsembleMetricFocus) => void;
}

/**
 * "Individual plans": one plan at a time, with its map and its full scores.
 * The reader walks a random sample of a hundred plans; the charts below mark
 * the selected plan and dot the sample.
 */
export const PlanSection: React.FC<PlanSectionProps> = ({
  presetLabel,
  planCountText,
  chunkCount,
  chunkIndex,
  onChunkChange,
  planIndex,
  onPlanIndexChange,
  chunk,
  chunkLoading,
  chunkFailed,
  geometry,
  focus,
  onSelectMetric,
}) => {
  const count = chunk?.plans.length ?? 0;
  const index = Math.min(planIndex, Math.max(0, count - 1));
  const selected = selectedPlanOf(chunkIndex, index, chunk);
  const sampled = selected ? chunk?.plans[index] : undefined;

  const caption = fillEnsembleText(ENSEMBLE_MODAL_TEXT.plansSampleCaption, {n: index + 1, count});
  const note = sampled
    ? fillEnsembleText(ENSEMBLE_MODAL_TEXT.plansSampleNote, {
        step: sampled.plan.toLocaleString(),
        sample: chunkIndex + 1,
        samples: chunkCount.toLocaleString(),
      })
    : '';

  return (
    <Flex direction="column" gap="3" pb="2">
      <Text size="2" as="p">
        {fillEnsembleText(ENSEMBLE_MODAL_TEXT.plansIntro, {
          plans: planCountText,
          preset: presetLabel,
        })}
      </Text>
      {chunkCount > 1 && (
        <Button
          size="1"
          variant="soft"
          className="cursor-pointer"
          style={{alignSelf: 'flex-start'}}
          onClick={() => {
            onPlanIndexChange(0);
            onChunkChange(anotherChunk(chunkIndex, chunkCount));
          }}
        >
          <ShuffleIcon />
          {ENSEMBLE_MODAL_TEXT.plansAnotherSample}
        </Button>
      )}
      {chunkLoading && (
        <Flex align="center" gap="2" py="3">
          <Spinner />
          <Text size="2">{ENSEMBLE_MODAL_TEXT.plansLoading}</Text>
        </Flex>
      )}
      {chunkFailed && (
        <Callout.Root color="amber" size="1" my="2">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{ENSEMBLE_MODAL_TEXT.plansFailed}</Callout.Text>
        </Callout.Root>
      )}
      {selected && (
        <Flex gap="4" align="start" wrap="wrap">
          <div style={{flex: '0 0 28%', minWidth: 200}}>
            <Flex direction="column" gap="2">
              {sampled && geometry && (
                <PlanThumbnail
                  geometry={geometry}
                  assignment={sampled.assignment}
                  alt={ENSEMBLE_MODAL_TEXT.planThumbnailAlt}
                />
              )}
              <Text size="2" weight="bold">
                {caption}
              </Text>
              {count > 1 && (
                <Slider
                  value={[index]}
                  min={0}
                  max={count - 1}
                  step={1}
                  size="1"
                  aria-label={ENSEMBLE_MODAL_TEXT.plansSliderLabel}
                  onValueChange={value => onPlanIndexChange(value[0])}
                />
              )}
              {note && (
                <Text size="1" color="gray">
                  {note}
                </Text>
              )}
            </Flex>
          </div>
          <div style={{flex: '1 1 0', minWidth: 280}}>
            <SegmentTables step={selected.metrics} focus={focus} onSelectMetric={onSelectMetric} />
          </div>
        </Flex>
      )}
    </Flex>
  );
};
