import React from 'react';
import {colorScheme} from '@/app/constants/colors';
import {formatNumber} from '@/app/utils/numbers';
import {Card, Text} from '@radix-ui/themes';

export const PopulationCustomTooltip = ({y, pop, index, idealPopulation, maxPop}: TooltipInput) => {
  const deviationFromIdeal = idealPopulation ? (idealPopulation - pop) * -1 : 0;
  const deviationDir = deviationFromIdeal > 0 ? '+' : '';
  const deviationPercent = idealPopulation
    ? formatNumber(deviationFromIdeal / idealPopulation, 'percent')
    : '';
  const deviationFromMax = maxPop ? (maxPop - pop) * -1 : 0;
  const deviationFromMaxDir = deviationFromMax > 0 ? '+' : '';
  const deviationFromMaxPercent = maxPop ? formatNumber(deviationFromMax / maxPop, 'percent') : '';
  const isMax = pop === maxPop;
  return (
    <foreignObject x="20" y={y + 10} width="300" height="120" style={{pointerEvents: 'none'}}>
      <Card size="1" style={{padding: '.25rem .375rem'}}>
        <span
          style={{
            width: '1rem',
            height: '1rem',
            borderRadius: '50%',
            background: colorScheme[index],
            display: 'inline-block',
            marginRight: '0.5rem',
          }}
        ></span>

        <span>
          Zone {index + 1}: {formatNumber(pop, 'string')}
        </span>
        <br />
        <Text>
          {idealPopulation && isMax
            ? `Deviation from max: 0`
            : `Deviation from max: ${deviationFromMaxDir}${deviationFromMaxPercent} (${deviationFromMaxDir}${formatNumber(deviationFromMax, 'string')})`}
        </Text>
        <br />
        <Text>
          {idealPopulation &&
            `Deviation from ideal: ${deviationDir}${deviationPercent} (${deviationDir}${formatNumber(deviationFromIdeal, 'string')})`}
        </Text>
      </Card>
    </foreignObject>
  );
};