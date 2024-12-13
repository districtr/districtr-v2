import {MapStore} from '@/app/store/mapStore';
import {colorScheme} from '@/app/constants/colors';
import React, {useCallback, useState} from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';
import {Bar, Line} from '@visx/shape';
import {scaleLinear} from '@visx/scale';
import {AxisBottom} from '@visx/axis';
import {useChartStore} from '@/app/store/chartStore';
import {LockIcon} from './LockIcon';
import {PopulationLabels} from './PopulationLabels';
import {PopulationCustomTooltip} from './PopulationTooltip';

export const PopulationChart: React.FC<{
  width: number;
  height: number;
  data: Array<{zone: number; total_pop: number}>;
  lockPaintedAreas: MapStore['mapOptions']['lockPaintedAreas'];
  margins?: {left: number; right: number; top: number; bottom: number};
  idealPopulation?: number;
}> = ({
  width,
  height,
  data,
  idealPopulation,
  lockPaintedAreas,
  margins = {left: 15, right: 20, top: 20, bottom: 80},
}) => {
  const chartOptions = useChartStore(state => state.chartOptions);
  const {
    popBarScaleToCurrent: scaleToCurrent,
    popTargetPopDeviation: targetDeviation,
    popShowPopNumbers: showPopNumbers,
    popShowDistrictNumbers: showDistrictrNumbers,
    popShowTopBottomDeviation: showTopBottomDeviation,
  } = chartOptions;

  const [xMax, yMax] = [
    width - margins.left - margins.right,
    height - margins.top - margins.bottom,
  ];
  const maxPop = Math.max(...data.map(r => r.total_pop));
  const xMaxValue = scaleToCurrent
    ? maxPop * 1.05
    : Math.max((idealPopulation || 0) * 1.3, ...data.map(r => r.total_pop * 1.2));
  const xMinValue = scaleToCurrent ? Math.min(...data.map(r => r.total_pop)) : 0;

  const xScale = useCallback(
    scaleLinear<number>({
      domain: [xMinValue, xMaxValue],
      range: [xMinValue > 0 ? 100 : 0, width - margins.left - margins.right],
      nice: true,
    }),
    [width, xMaxValue, xMinValue]
  );
  const barHeight = yMax / data.length - 6;

  const yScale = useCallback(
    scaleLinear({
      domain: [0, data.length],
      range: [0, height - margins.top - margins.bottom], // Adjust bar height
    }),
    [data.length, height, margins]
  );

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <svg
      width={width}
      height={height}
      style={{position: 'relative'}}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredIndex(null);
      }}
    >
      <Group left={margins.left} top={margins.top} onMouseLeave={() => setHoveredIndex(null)}>
        {!!idealPopulation && (
          <>
            <Line
              from={{x: xScale(idealPopulation), y: margins.top * -1}}
              to={{
                x: xScale(idealPopulation),
                y: yMax,
              }}
              stroke="black"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <Group left={xScale(idealPopulation) + 5} top={-5}>
              <text textAnchor="start" fontSize="14px">
                Ideal{' '}
                {isHovered ? (
                  <tspan color="gray">{formatNumber(idealPopulation, 'string')}</tspan>
                ) : (
                  ''
                )}
              </text>
            </Group>
            {!!targetDeviation && (
              <Bar
                x={xScale(Math.max(0, idealPopulation - targetDeviation))}
                width={
                  xScale(Math.max(0, idealPopulation + targetDeviation)) -
                  xScale(Math.max(0, idealPopulation - targetDeviation))
                }
                y={-margins.top}
                height={yMax + margins.top}
                fill="gray"
                fillOpacity={0.15}
              />
            )}
          </>
        )}
        {data.map((entry, index) => (
          <>
            {entry.total_pop > 0 && (
              <>
                {hoveredIndex === index && (
                  <Bar
                    key={`bg-bar-${entry.zone}`}
                    x={0}
                    y={yScale(index)}
                    width={xMax + margins.right}
                    height={barHeight + 6}
                    fill={colorScheme[entry.zone - 1]}
                    fillOpacity={0.3}
                    style={{
                      pointerEvents: 'none',
                    }}
                  />
                )}
                <Bar
                  key={`bar-${entry.zone}`}
                  x={0}
                  y={yScale(index) + 5}
                  width={xScale(entry.total_pop)}
                  height={barHeight}
                  fill={colorScheme[entry.zone - 1]}
                  fillOpacity={0.9}
                  style={{
                    pointerEvents: 'none',
                  }}
                  // onMouseEnter={() => setHoveredIndex(index)}
                  // onMouseLeave={() => setHoveredIndex(null)}
                />
                <Bar
                  key={`bar-interactive-${entry.zone}`}
                  x={0}
                  y={yScale(index) + 5}
                  width={xMax}
                  height={barHeight}
                  fillOpacity={0}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </>
            )}
            {!!showDistrictrNumbers && (
              <>
                <text
                  x={-margins.left}
                  y={yScale(index) + barHeight * 0.75}
                  fontSize={14}
                  fontWeight={'bold'}
                  stroke="white"
                  strokeWidth={2}
                >
                  {entry.zone}
                </text>
                <text
                  x={-margins.left}
                  y={yScale(index) + barHeight * 0.75}
                  fontSize={14}
                  fontWeight={'bold'}
                >
                  {entry.zone}
                </text>
              </>
            )}
            {!!(
              lockPaintedAreas === true ||
              (Array.isArray(lockPaintedAreas) && lockPaintedAreas.includes(entry.zone))
            ) && (
              <g transform={`translate(${15}, ${yScale(index) + 2}), scale(1)`}>
                <LockIcon />
              </g>
            )}
            {entry.total_pop > 0 && (
              <PopulationLabels
                {...{
                  xScale,
                  yScale,
                  entry,
                  maxPop,
                  index,
                  barHeight,
                  isHovered,
                  showPopNumbers,
                  showTopBottomDeviation,
                }}
              />
            )}
          </>
        ))}
        {/* Ocassionally, the "nice" formatting makes part of the axis missing */}
        <Line from={{x: 0, y: yMax + 6}} to={{x: xMax, y: yMax + 6}} stroke="black" />
        <AxisBottom
          scale={xScale}
          top={yMax + 6}
          numTicks={2}
          tickLabelProps={{
            fontSize: '14px',
          }}
          tickFormat={v => formatNumber(v as number, 'compact')}
        />

        {hoveredIndex !== null && (
          <PopulationCustomTooltip
            y={yScale(hoveredIndex) + 5}
            index={hoveredIndex}
            pop={data[hoveredIndex].total_pop}
            idealPopulation={idealPopulation}
            maxPop={maxPop}
          />
        )}
      </Group>
    </svg>
  );
};