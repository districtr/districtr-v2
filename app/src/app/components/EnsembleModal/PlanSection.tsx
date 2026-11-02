'use client';
import React from 'react';
import {Button, Callout, Flex, Select, Slider, Spinner, Text} from '@radix-ui/themes';
import {InfoCircledIcon, ShuffleIcon} from '@radix-ui/react-icons';
import {ensembleExtremeThumbUrl} from './ensembleData';
import type {EnsembleMetricFocus} from './ensembleMetrics';
import {ENSEMBLE_MODAL_TEXT, fillEnsembleText} from './ensembleModalText';
import {anotherChunk, SAMPLE_SOURCE_VALUE, selectedPlanOf, type PlanSource} from './ensemblePlans';
import {PlanThumbnail} from './PlanThumbnail';
import {SegmentTables} from './SegmentTables';
import type {EnsembleChunk, EnsembleGeometry, EnsembleObjective} from './ensembleTypes';

export interface PlanSectionProps {
  moduleSlug: string;
  presetKey: string;
  presetLabel: string;
  planCountText: string;
  /** Number of chunks the package holds; 0 offers searches only. */
  chunkCount: number;
  objectives: EnsembleObjective[];
  source: PlanSource;
  onSourceChange: (source: PlanSource) => void;
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
 * The reader walks a random sample of a hundred plans, or the plans a search
 * found for one goal; the charts below mark the selected plan and dot the
 * sample.
 */
export const PlanSection: React.FC<PlanSectionProps> = ({
  moduleSlug,
  presetKey,
  presetLabel,
  planCountText,
  chunkCount,
  objectives,
  source,
  onSourceChange,
  planIndex,
  onPlanIndexChange,
  chunk,
  chunkLoading,
  chunkFailed,
  geometry,
  focus,
  onSelectMetric,
}) => {
  const searches = objectives.filter(objective => objective.plans.length > 0);
  const objective =
    source.kind === 'extreme' ? searches.find(o => o.key === source.objective) : undefined;
  const plans = source.kind === 'sample' ? (chunk?.plans ?? []) : (objective?.plans ?? []);
  const count = plans.length;
  const index = Math.min(planIndex, Math.max(0, count - 1));
  const selected = selectedPlanOf(source, index, chunk, objectives);
  const sampled = source.kind === 'sample' ? chunk?.plans[index] : undefined;
  const extreme = source.kind === 'extreme' ? objective?.plans[index] : undefined;

  const sourceValue = source.kind === 'sample' ? SAMPLE_SOURCE_VALUE : source.objective;
  const handleSourceChange = (value: string) => {
    onPlanIndexChange(0);
    onSourceChange(
      value === SAMPLE_SOURCE_VALUE
        ? {kind: 'sample', chunk: source.kind === 'sample' ? source.chunk : 0}
        : {kind: 'extreme', objective: value}
    );
  };

  const caption =
    source.kind === 'sample'
      ? fillEnsembleText(ENSEMBLE_MODAL_TEXT.plansSampleCaption, {n: index + 1, count})
      : fillEnsembleText(ENSEMBLE_MODAL_TEXT.plansExtremeCaption, {
          label: objective?.label ?? '',
          n: index + 1,
          count,
        });
  const note =
    source.kind === 'sample'
      ? sampled
        ? fillEnsembleText(ENSEMBLE_MODAL_TEXT.plansSampleNote, {
            step: sampled.plan.toLocaleString(),
            sample: source.chunk + 1,
            samples: chunkCount.toLocaleString(),
          })
        : ''
      : ENSEMBLE_MODAL_TEXT.plansExtremeNote;

  return (
    <Flex direction="column" gap="3" pb="2">
      <Text size="2" as="p">
        {fillEnsembleText(ENSEMBLE_MODAL_TEXT.plansIntro, {
          plans: planCountText,
          preset: presetLabel,
        })}
      </Text>
      <Flex gap="2" align="center" wrap="wrap">
        <Select.Root size="1" value={sourceValue} onValueChange={handleSourceChange}>
          <Select.Trigger aria-label={ENSEMBLE_MODAL_TEXT.plansSourceLabel} />
          <Select.Content>
            {chunkCount > 0 && (
              <Select.Item value={SAMPLE_SOURCE_VALUE}>
                {ENSEMBLE_MODAL_TEXT.plansSampleOption}
              </Select.Item>
            )}
            {searches.map(search => (
              <Select.Item key={search.key} value={search.key}>
                {fillEnsembleText(ENSEMBLE_MODAL_TEXT.plansExtremeOption, {label: search.label})}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        {source.kind === 'sample' && chunkCount > 1 && (
          <Button
            size="1"
            variant="soft"
            className="cursor-pointer"
            onClick={() => {
              onPlanIndexChange(0);
              onSourceChange({kind: 'sample', chunk: anotherChunk(source.chunk, chunkCount)});
            }}
          >
            <ShuffleIcon />
            {ENSEMBLE_MODAL_TEXT.plansAnotherSample}
          </Button>
        )}
      </Flex>
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
              {sampled && geometry ? (
                <PlanThumbnail
                  geometry={geometry}
                  assignment={sampled.assignment}
                  alt={ENSEMBLE_MODAL_TEXT.planThumbnailAlt}
                />
              ) : extreme && objective ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ensembleExtremeThumbUrl(
                    moduleSlug,
                    presetKey,
                    objective.key,
                    index,
                    extreme.thumb
                  )}
                  alt={ENSEMBLE_MODAL_TEXT.planThumbnailAlt}
                  style={{
                    width: '100%',
                    aspectRatio: '4 / 3',
                    objectFit: 'contain',
                    background: 'var(--gray-2)',
                    borderRadius: 'var(--radius-2)',
                  }}
                />
              ) : null}
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
