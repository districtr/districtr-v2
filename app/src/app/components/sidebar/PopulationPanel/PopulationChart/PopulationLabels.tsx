import React from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';
import {SummaryRecord} from '@/app/utils/api/summaryStats';
import {NUMBER_FORMATS} from '@constants/demography/format';

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
  /** Right edge of the plot area. Bars past it are clipped, so labels clamp here too. */
  xMax: number;
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
  xMax,
}) => {
  // TODO: Split labels into poplabels and ideal pop label diff
  const hasIdealPopulation = idealPopulation !== undefined;
  const popDiff = hasIdealPopulation ? entry.total_pop_20 - idealPopulation : undefined;
  const _popDiffLabel =
    popDiff === undefined
      ? undefined
      : Math.abs(popDiff) < 1
        ? `0`
        : formatNumber(popDiff, NUMBER_FORMATS.STRING);
  const popDiffLabel =
    popDiff === undefined || _popDiffLabel === undefined
      ? undefined
      : popDiff >= 1
        ? `+${_popDiffLabel}`
        : _popDiffLabel;
  const popLabel = formatNumber(entry.total_pop_20, NUMBER_FORMATS.STRING);
  if (popLabel === undefined) return null;
  // Over-ideal bars anchor their labels to the ideal line — deviation to its left, population
  // to its right — so the numbers stay put instead of chasing the (clipped) bar end.
  const isOverIdeal = hasIdealPopulation && entry.total_pop_20 > idealPopulation;
  // "Current range" scaling starts the domain at the smallest current population, so
  // the ideal line can fall outside the plot entirely (every district over ideal
  // extrapolates it negative). Clamp the anchor into the plot area.
  const idealX = hasIdealPopulation ? xScale(idealPopulation) : 0;
  const idealOnPlot = isOverIdeal && idealX >= 0 && idealX <= xMax;
  const [left, top] = [
    isOverIdeal ? Math.min(Math.max(idealX, 0), xMax) : Math.min(xScale(entry.total_pop_20), xMax),
    yScale(index) + 5 + barHeight / 2,
  ];
  const showDeviationLabel = hasIdealPopulation && !!(isHovered || showTopBottomDeviation);

  let offsetLeft = 0;
  if (idealOnPlot) {
    // anchored at the ideal line, which leaves room on both sides
  } else if (popDiffLabel && left < popDiffLabel.length * 8 && showDeviationLabel) {
    offsetLeft = Math.max(popDiffLabel.length, 2) * 8 + 4;
  } else if (left > width - popLabel.length * 10) {
    offsetLeft = -popLabel.length * 10;
  }

  return (
    <Group left={left + offsetLeft} top={top} style={{pointerEvents: 'none'}}>
      {!!(isHovered || showPopNumbers) && (
        <>
          <text
            x={5}
            y={0}
            fontSize={14}
            fontWeight={'bold'}
            textAnchor="start"
            dominantBaseline="central"
          >
            {popLabel}
          </text>
        </>
      )}
      {!!(showDeviationLabel && popDiffLabel) && (
        <>
          <text
            x={-5}
            y={0}
            fontSize={14}
            textAnchor="end"
            dominantBaseline="central"
            fill="white"
            stroke="white"
            strokeWidth="3"
          >
            {popDiffLabel}
          </text>
          <text x={-5} y={0} fontSize={14} textAnchor="end" dominantBaseline="central">
            {popDiffLabel}
          </text>
        </>
      )}
    </Group>
  );
};
