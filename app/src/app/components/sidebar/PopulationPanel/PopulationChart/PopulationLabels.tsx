import React from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';

export const PopulationLabels: React.FC<{
  xScale: (value: number) => number;
  yScale: (value: number) => number;
  entry: {zone: number; total_pop: number};
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
  const popDiffLabel = formatNumber(entry.total_pop - (idealPopulation || 0), 'string');
  const popLabel = formatNumber(entry.total_pop, 'string');
  if (!popDiffLabel || !popLabel) return null;
  const [left, top] = [xScale(entry.total_pop), yScale(index) + barHeight];

  let offsetLeft = 0;
  if (left < popDiffLabel.length * 8 && (isHovered || showTopBottomDeviation)) {
    offsetLeft = Math.max(popDiffLabel.length, 2) * 8 + 4;
  } else if (left > width - popLabel.length * 10) {
    offsetLeft = -popLabel.length * 10;
  }

  return (
    <Group left={left + offsetLeft} top={top} style={{pointerEvents: 'none'}}>
      {!!(isHovered || showPopNumbers) && (
        <text x={5} y={-2} fontSize={14} fontWeight={'bold'} textAnchor="start">
          {popLabel}
        </text>
      )}
      {!!(isHovered || showTopBottomDeviation) && (
        <>
          <text x={-5} y={-2} fontSize={14} textAnchor="end">
            {popDiffLabel}
          </text>
        </>
      )}
    </Group>
  );
};
