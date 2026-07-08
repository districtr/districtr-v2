import {useMapControlsStore} from '@/app/store/mapControlsStore';
import React, {useMemo, useState, useCallback} from 'react';
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
import {NUMBER_FORMATS} from '@constants/demography/format';

export const PopulationChart: React.FC<{
  width: number;
  height: number;
  data: Array<SummaryRecord>;
  margins?: {left: number; right: number; top: number; bottom: number};
  idealPopulation?: number;
  enableStickyRows?: boolean;
  onBarSelect?: (zone: number) => void;
}> = ({
  width,
  height,
  data,
  idealPopulation,
  enableStickyRows = false,
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

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, data.length],
        range: [0, yMax],
      }),
    [data.length, yMax]
  );

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Render helpers (not components) — they close over shared state (scales, hover, colors)
  // and are only used within this component, so plain functions avoid prop-drilling 10+ values.
  const renderIdealReference = (fromY: number, referenceHeight: number) => {
    if (!effectiveIdealPopulation) return null;

    return (
      <>
        <Line
          from={{x: xScale(effectiveIdealPopulation), y: fromY}}
          to={{
            x: xScale(effectiveIdealPopulation),
            y: referenceHeight,
          }}
          stroke="black"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {!!effectiveTargetDeviation && (
          <Bar
            x={xScale(Math.max(0, effectiveIdealPopulation - effectiveTargetDeviation))}
            width={
              xScale(Math.max(0, effectiveIdealPopulation + effectiveTargetDeviation)) -
              xScale(Math.max(0, effectiveIdealPopulation - effectiveTargetDeviation))
            }
            y={fromY}
            height={referenceHeight - fromY}
            fill="gray"
            fillOpacity={0.15}
          />
        )}
      </>
    );
  };

  const renderBars = () =>
    data.map((entry, index) => (
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
    ));

  // Parent container not ready yet
  if (xMax < 0) {
    return null;
  }

  if (enableStickyRows) {
    return (
      <div
        style={{height, position: 'relative'}}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setHoveredIndex(null);
        }}
      >
        <div style={{position: 'sticky', top: 0, zIndex: 2, backgroundColor: 'var(--gray-1)'}}>
          <svg width={width} height={margins.top}>
            <Group left={margins.left}>
              {renderIdealReference(0, margins.top)}
              {!!effectiveIdealPopulation && (
                <text
                  x={xScale(effectiveIdealPopulation) + 5}
                  y={margins.top - 5}
                  textAnchor="start"
                  fontSize="14px"
                >
                  Ideal{' '}
                  {isHovered ? (
                    <tspan color="gray">
                      {formatNumber(effectiveIdealPopulation, NUMBER_FORMATS.STRING)}
                    </tspan>
                  ) : (
                    ''
                  )}
                </text>
              )}
            </Group>
          </svg>
        </div>
        <svg width={width} height={yMax}>
          <Group left={margins.left} onMouseLeave={() => setHoveredIndex(null)}>
            {renderIdealReference(0, yMax)}
            {renderBars()}
          </Group>
        </svg>
        {/* Sticky axis pinned to bottom of scroll viewport; offset accounts for ScrollArea padding */}
        <div style={{position: 'sticky', bottom: -30, zIndex: 2, width: '100%'}}>
          <svg width={width} height={margins.bottom}>
            <Group left={margins.left} top={6}>
              <rect x={0} y={0} width={xMax} height={50} fill="var(--gray-1)" />
              <Line from={{x: 0, y: 0}} to={{x: xMax, y: 0}} stroke="black" />
              <AxisBottom
                scale={xScale}
                top={0}
                numTicks={2}
                tickLabelProps={{
                  fontSize: '14px',
                }}
                tickFormat={v => formatNumber(v as number, NUMBER_FORMATS.COMPACT)}
              />
            </Group>
          </svg>
        </div>
      </div>
    );
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
          <Group left={xScale(effectiveIdealPopulation) + 5} top={-5}>
            <text textAnchor="start" fontSize="14px">
              Ideal{' '}
              {isHovered ? (
                <tspan color="gray">
                  {formatNumber(effectiveIdealPopulation, NUMBER_FORMATS.STRING)}
                </tspan>
              ) : (
                ''
              )}
            </text>
          </Group>
        )}
        {renderIdealReference(-margins.top, yMax)}
        {renderBars()}
        {/* Occasionally, the "nice" formatting makes part of the axis missing */}
        <Line from={{x: 0, y: yMax + 6}} to={{x: xMax, y: yMax + 6}} stroke="black" />
        <AxisBottom
          scale={xScale}
          top={yMax + 6}
          numTicks={2}
          tickLabelProps={{
            fontSize: '14px',
          }}
          tickFormat={v => formatNumber(v as number, NUMBER_FORMATS.COMPACT)}
        />
      </Group>
    </svg>
  );
};
