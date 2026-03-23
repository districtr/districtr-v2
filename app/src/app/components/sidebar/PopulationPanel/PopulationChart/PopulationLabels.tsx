import React from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';
import {SummaryRecord} from '@/app/utils/api/summaryStats';

export const PopulationLabels: React.FC<{
  xScale: (value: number) => number;
  yScale: (value: number) => number;
  entry: SummaryRecord;
  maxPop: number;
  idealPopulation?: number;
  index: number;
  barHeight: number;
  isHovered: boolean;
  showPopNumbers: boolean;
  showTopBottomDeviation: boolean;
  width: number;
}> = ({
  xScale,
  yScale,
  entry,
  maxPop,
  idealPopulation,
  index,
  barHeight,
  isHovered,
  showPopNumbers,
  showTopBottomDeviation,
  width,
}) => {
  // TODO: Split labels into poplabels and ideal pop label diff
  const hasIdealPopulation = idealPopulation !== undefined;
  const popDiff = hasIdealPopulation ? entry.total_pop_20 - idealPopulation : undefined;
  const _popDiffLabel =
    popDiff === undefined
      ? undefined
      : Math.abs(popDiff) < 1
        ? `0`
        : formatNumber(popDiff, 'string');
  const popDiffLabel =
    popDiff === undefined || _popDiffLabel === undefined
      ? undefined
      : popDiff >= 1
        ? `+${_popDiffLabel}`
        : _popDiffLabel;
  const popLabel = formatNumber(entry.total_pop_20, 'string');
  if (popLabel === undefined) return null;
  const [left, top] = [xScale(entry.total_pop_20), yScale(index) + barHeight];
  const showDeviationLabel = hasIdealPopulation && !!(isHovered || showTopBottomDeviation);

  let offsetLeft = 0;
  if (popDiffLabel && left < popDiffLabel.length * 8 && showDeviationLabel) {
    offsetLeft = Math.max(popDiffLabel.length, 2) * 8 + 4;
  } else if (left > width - popLabel.length * 10) {
    offsetLeft = -popLabel.length * 10;
  }

  return (
    <Group left={left + offsetLeft} top={top} style={{pointerEvents: 'none'}}>
      {!!(isHovered || showPopNumbers) && (
        <>
          <text x={5} y={-2} fontSize={14} fontWeight={'bold'} textAnchor="start">
            {popLabel}
          </text>
        </>
      )}
      {!!(showDeviationLabel && popDiffLabel) && (
        <>
          <text
            x={-5}
            y={-1}
            fontSize={14}
            textAnchor="end"
            fill="white"
            stroke="white"
            strokeWidth="3"
          >
            {popDiffLabel}
          </text>
          <text x={-5} y={-1} fontSize={14} textAnchor="end">
            {popDiffLabel}
          </text>
        </>
      )}
    </Group>
  );
};
