import {useMapControlsStore} from '@/app/store/mapControlsStore';
import React, {useCallback, useState} from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';
import {Bar, Line} from '@visx/shape';
import {scaleLinear} from '@visx/scale';
import {AxisBottom} from '@visx/axis';
import {useChartStore} from '@/app/store/chartStore';
import {PopulationLabels} from './PopulationLabels';
import {SummaryRecord} from '@/app/utils/api/summaryStats';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {MAP_MODES} from '@constants/map/mode';

export const PopulationChart: React.FC<{
  width: number;
  height: number;
  data: Array<SummaryRecord>;
  margins?: {left: number; right: number; top: number; bottom: number};
  idealPopulation?: number;
  onBarSelect?: (zone: number) => void;
}> = ({
  width,
  height,
  data,
  idealPopulation,
  onBarSelect,
  margins = {left: 5, right: 20, top: 20, bottom: 80},
}) => {
  const chartOptions = useChartStore(state => state.chartOptions);
  const colorScheme = useColorScheme();
  const getZoneColor = useZoneColorGetter();
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isCommunityMode = mapMode === MAP_MODES.COI;

  const {
    popBarScaleToCurrent: scaleToCurrent,
    popTargetPopDeviation: targetDeviation,
    popShowPopNumbers: showPopNumbers,
    popShowTopBottomDeviation: showTopBottomDeviation,
  } = chartOptions;
  const effectiveIdealPopulation = isCommunityMode ? undefined : idealPopulation;
  const effectiveTargetDeviation = isCommunityMode ? undefined : targetDeviation;
  const effectiveShowTopBottomDeviation = isCommunityMode ? false : showTopBottomDeviation;
  const [xMax, yMax] = [
    width - margins.left - margins.right,
    height - margins.top - margins.bottom,
  ];
  const maxPop = Math.max(...data.map(r => r.total_pop_20));
  const xMaxValue = scaleToCurrent
    ? maxPop * 1.05
    : Math.max((effectiveIdealPopulation || 0) * 1.3, ...data.map(r => r.total_pop_20 * 1.2));
  const xMinValue = scaleToCurrent ? Math.min(...data.map(r => r.total_pop_20)) : 0;

  const xScale = useCallback(
    scaleLinear<number>({
      domain: [xMinValue, xMaxValue],
      range: [
        xMinValue > 0 ? (isCommunityMode ? 5 : 100) : 0,
        width - margins.left - margins.right,
      ],
      nice: true,
    }),
    [isCommunityMode, width, xMaxValue, xMinValue]
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

  // Parnent container not ready yet
  if (xMax < 0) {
    return null;
  }

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
        {!!effectiveIdealPopulation && (
          <>
            <Line
              from={{x: xScale(effectiveIdealPopulation), y: margins.top * -1}}
              to={{
                x: xScale(effectiveIdealPopulation),
                y: yMax,
              }}
              stroke="black"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <Group left={xScale(effectiveIdealPopulation) + 5} top={-5}>
              <text textAnchor="start" fontSize="14px">
                Ideal{' '}
                {isHovered ? (
                  <tspan color="gray">{formatNumber(effectiveIdealPopulation, 'string')}</tspan>
                ) : (
                  ''
                )}
              </text>
            </Group>
            {!!effectiveTargetDeviation && (
              <Bar
                x={xScale(Math.max(0, effectiveIdealPopulation - effectiveTargetDeviation))}
                width={
                  xScale(Math.max(0, effectiveIdealPopulation + effectiveTargetDeviation)) -
                  xScale(Math.max(0, effectiveIdealPopulation - effectiveTargetDeviation))
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
          <React.Fragment key={`pop-bar-group-${index}`}>
            {entry.total_pop_20 > 0 && (
              <>
                <Bar
                  key={`bar-interactive-${entry.zone}`}
                  x={0}
                  y={yScale(index)}
                  width={xMax}
                  height={barHeight + 10}
                  className="opacity-0 hover:opacity-10 transition-opacity duration-300 cursor-pointer"
                  onClick={() => onBarSelect?.(entry.zone)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                <Bar
                  key={`bar-${entry.zone}`}
                  x={0}
                  y={yScale(index) + 5}
                  width={entry.total_pop_20 > 0 ? xScale(entry.total_pop_20) : 0}
                  height={barHeight}
                  fill={getZoneColor(entry.zone, colorScheme[entry.zone - 1] ?? '#000000')}
                  fillOpacity={0.9}
                  style={{
                    pointerEvents: 'none',
                  }}
                />
              </>
            )}
            {entry.total_pop_20 > 0 && (
              <PopulationLabels
                {...{
                  xScale,
                  yScale,
                  entry,
                  maxPop,
                  idealPopulation: effectiveIdealPopulation,
                  index,
                  barHeight,
                  isHovered,
                  showPopNumbers,
                  showTopBottomDeviation: effectiveShowTopBottomDeviation,
                  width,
                }}
              />
            )}
          </React.Fragment>
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
      </Group>
    </svg>
  );
};
