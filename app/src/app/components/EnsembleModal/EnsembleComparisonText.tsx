'use client';
import React from 'react';
import {Text} from '@radix-ui/themes';
import {extremeShareColor, formatShare} from '@utils/ensembleStats';

/**
 * The sentence placing a plan against an ensemble, shared by the hover popups
 * and the chart: the ensemble's median, then the share of plans at least as
 * extreme as this one, coloured redder the rarer the plan's position is.
 */
export const EnsembleComparisonText: React.FC<{
  median: string;
  extreme: number;
  /** Rendered right after the median, inside the parentheses. */
  moreInfo?: React.ReactNode;
  /** How the sentence names the plan: "this plan" beside its own cell, "the
   * evaluated plan" in the modal, where several plans are on screen. */
  subject?: string;
}> = ({median, extreme, moreInfo, subject = 'this plan'}) => (
  <Text size="2">
    The median of the ensemble of randomly generated plans is {median}
    {moreInfo ? <> ({moreInfo})</> : null}.{' '}
    <Text size="2" weight="bold" style={{color: extremeShareColor(extreme)}}>
      {formatShare(extreme)}
    </Text>{' '}
    of the ensemble plans are more extreme than, or equally extreme as, {subject}.
  </Text>
);
