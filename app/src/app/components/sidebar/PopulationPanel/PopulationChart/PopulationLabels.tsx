import React from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';

export const PopulationLabels: React.FC<{
  xScale: (value: number) => number;
  yScale: (value: number) => number;
  entry: {zone: number; total_pop: number};
  maxPop: number;
  index: number;
  barHeight: number;
  isHovered: boolean;
  showPopNumbers: boolean;
  showTopBottomDeviation: boolean;
}> = ({
  xScale,
  yScale,
  entry,
  maxPop,
  index,
  barHeight,
  isHovered,
  showPopNumbers,
  showTopBottomDeviation,
}) => {
  const popDiffLabel = formatNumber(entry.total_pop - maxPop, 'string');
  const popLabel = formatNumber(entry.total_pop, 'string');
  return (
    <Group
      left={xScale(entry.total_pop)}
      top={yScale(index) + barHeight}
      style={{pointerEvents: 'none'}}
    >
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
