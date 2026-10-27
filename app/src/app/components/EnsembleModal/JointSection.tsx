'use client';
import React, {useMemo, useState} from 'react';
import {Flex, Select, Spinner, Text} from '@radix-ui/themes';
import {ParentSize} from '@visx/responsive';
import type {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {formatElectionKey} from '@utils/elections';
import {useEnsembleJoint} from './ensembleData';
import {metricForRef, type EnsembleMetricDef} from './ensembleMetrics';
import {sliceComparison, sliceGoal, sliceSentence} from './ensembleJoint';
import {ENSEMBLE_MODAL_TEXT, fillEnsembleText} from './ensembleModalText';
import {JointDensity} from './JointDensity';
import type {EnsembleJointPair, EnsembleMetricsPayload} from './ensembleTypes';

const CHART_HEIGHT = 360;
const CHART_MAX_WIDTH = 760;

interface ResolvedSeries {
  def: EnsembleMetricDef;
  election?: string;
  label: string;
}

/** A pair whose two series the modal can name and chart. */
export interface ResolvedPair {
  pair: EnsembleJointPair;
  x: ResolvedSeries;
  y: ResolvedSeries;
}

const seriesLabel = (def: EnsembleMetricDef, election?: string) =>
  election
    ? fillEnsembleText(ENSEMBLE_MODAL_TEXT.jointAxisElection, {
        label: def.label,
        election: formatElectionKey(election),
      })
    : def.label;

/** The pairs of an index the modal has metric definitions for, in index order. */
export const resolvePairs = (pairs: EnsembleJointPair[]): ResolvedPair[] =>
  pairs.flatMap(pair => {
    const x = metricForRef(pair.x);
    const y = metricForRef(pair.y);
    if (!x || !y) return [];
    return [
      {
        pair,
        x: {...x, label: seriesLabel(x.def, x.election)},
        y: {...y, label: seriesLabel(y.def, y.election)},
      },
    ];
  });

export interface JointSectionProps {
  moduleSlug: string;
  presetKey: string;
  presetLabel: string;
  /** The plan count as the modal's other sentences print it. */
  planCountText: string;
  pairs: ResolvedPair[];
  /** The section is expanded: only then is the chosen pair's file fetched. */
  open: boolean;
  evaluation?: DocumentEvaluation;
  /** The demonstration step selected above, marked as a second point. */
  step?: EnsembleMetricsPayload;
  planLabel: string;
  stepLabel: string;
}

/**
 * "Two metrics at once": the joint density of a chosen pair of series, with
 * the evaluated plan and the selected step marked, and one sentence comparing
 * the plans that score best on the first series with the rest.
 */
export const JointSection: React.FC<JointSectionProps> = ({
  moduleSlug,
  presetKey,
  presetLabel,
  planCountText,
  pairs,
  open,
  evaluation,
  step,
  planLabel,
  stepLabel,
}) => {
  const [pairId, setPairId] = useState<string | null>(null);
  const selected = pairs.find(entry => entry.pair.id === pairId) ?? pairs[0];
  const jointQuery = useEnsembleJoint(moduleSlug, presetKey, selected?.pair, open);
  const joint = jointQuery.data;

  const sentence = useMemo(() => {
    if (!joint || !selected) return null;
    const result = sliceComparison(joint, sliceGoal(selected.x.def.id));
    return result
      ? sliceSentence({result, preset: presetLabel, x: selected.x, y: selected.y})
      : null;
  }, [joint, selected, presetLabel]);

  if (!selected) return null;
  const {x, y} = selected;
  const plan = evaluation
    ? {x: x.def.planValue(evaluation, x.election), y: y.def.planValue(evaluation, y.election)}
    : undefined;
  const stepPoint = step
    ? {x: x.def.stepValue(step, x.election), y: y.def.stepValue(step, y.election)}
    : undefined;

  return (
    <Flex direction="column" gap="2" pb="2">
      <Text size="1" color="gray">
        {fillEnsembleText(ENSEMBLE_MODAL_TEXT.jointIntro, {
          plans: planCountText,
          preset: presetLabel,
        })}
      </Text>
      <Flex direction="column" gap="1">
        <Select.Root size="1" value={selected.pair.id} onValueChange={setPairId}>
          <Select.Trigger
            aria-label={ENSEMBLE_MODAL_TEXT.jointPairLabel}
            style={{alignSelf: 'flex-start'}}
          />
          <Select.Content>
            {pairs.map(entry => (
              <Select.Item key={entry.pair.id} value={entry.pair.id}>
                {fillEnsembleText(ENSEMBLE_MODAL_TEXT.jointPairOption, {
                  x: entry.x.label,
                  y: entry.y.label,
                })}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        {selected.pair.why && (
          <Text size="1" color="gray">
            {selected.pair.why}
          </Text>
        )}
      </Flex>
      {jointQuery.isLoading && (
        <Flex align="center" gap="2" py="3">
          <Spinner />
          <Text size="2">{ENSEMBLE_MODAL_TEXT.jointLoading}</Text>
        </Flex>
      )}
      {joint && (
        <>
          <div style={{width: '100%', maxWidth: CHART_MAX_WIDTH, margin: '0 auto'}}>
            <ParentSize>
              {({width}) => (
                <JointDensity
                  joint={joint}
                  xLabel={x.label}
                  yLabel={y.label}
                  xFormat={x.def.format}
                  yFormat={y.def.format}
                  plan={plan}
                  planLabel={planLabel}
                  step={stepPoint}
                  stepLabel={stepLabel}
                  width={width}
                  height={CHART_HEIGHT}
                />
              )}
            </ParentSize>
          </div>
          {sentence && (
            <Text size="2" as="p" mt="2">
              {sentence}
            </Text>
          )}
        </>
      )}
    </Flex>
  );
};
