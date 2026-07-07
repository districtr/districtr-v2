import {useMapControlsStore} from '@/app/store/mapControlsStore';
import React, {useMemo, useState} from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';
import {Bar, Line} from '@visx/shape';
import {scaleLinear} from '@visx/scale';
import {AxisTop} from '@visx/axis';
import {useChartStore} from '@/app/store/chartStore';
import {PopulationLabels} from './PopulationLabels';
import {SummaryRecord} from '@/app/utils/api/summaryStats';
import {useColorScheme} from '@/app/hooks/useColorScheme';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';
import {MAP_MODES} from '@constants/map/mode';
import {NUMBER_FORMATS} from '@constants/demography/format';

type ChartMargins = {left: number; right: number; top: number; bottom: number};
const DEFAULT_MARGINS: ChartMargins = {left: 5, right: 20, top: 6, bottom: 10};

/** Height of the standalone top-axis strip rendered by PopulationChartAxis. */
export const POP_CHART_AXIS_HEIGHT = 36;

// The axis strip and the bar chart are separate components (the axis sits outside the
// scroll area), so they must derive the exact same x-scale from the same inputs.
const usePopulationXScale = (
  width: number,
  data: Array<SummaryRecord>,
  idealPopulation: number | undefined,
  margins: ChartMargins
) => {
  const scaleToCurrent = useChartStore(state => state.chartOptions.popBarScaleToCurrent);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isCommunityMode = mapMode === MAP_MODES.COI;
  const effectiveIdealPopulation = isCommunityMode ? undefined : idealPopulation;

  const maxPop = Math.max(...data.map(r => r.total_pop_20));
  const xMaxValue = scaleToCurrent
    ? maxPop * 1.05
    : Math.max((effectiveIdealPopulation || 0) * 1.3, ...data.map(r => r.total_pop_20 * 1.2));
  const xMinValue = scaleToCurrent ? Math.min(...data.map(r => r.total_pop_20)) : 0;
  const xMax = width - margins.left - margins.right;

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [xMinValue, xMaxValue],
        range: [xMinValue > 0 ? (isCommunityMode ? 5 : 100) : 0, xMax],
        nice: true,
      }),
    [isCommunityMode, xMax, xMaxValue, xMinValue]
  );

  return {xScale, xMax, effectiveIdealPopulation, maxPop, isCommunityMode};
};

/**
 * Standalone top axis strip. Rendered above the (possibly scrollable) bar rows so the
 * axis and the lock-all control never scroll out of view.
 */
export const PopulationChartAxis: React.FC<{
  width: number;
  data: Array<SummaryRecord>;
  idealPopulation?: number;
  margins?: ChartMargins;
}> = ({width, data, idealPopulation, margins = DEFAULT_MARGINS}) => {
  const {xScale, xMax, effectiveIdealPopulation} = usePopulationXScale(
    width,
    data,
    idealPopulation,
    margins
  );
  if (xMax <= 0 || !data.length) return null;
  const lineY = POP_CHART_AXIS_HEIGHT - 1;

  // The "Ideal" label shares the line with the tick numbers, and the ideal value can land
  // anywhere on the axis. Estimate label extents (~8px/char at 14px font) and place the
  // label on whichever side of the dashed line doesn't collide with a tick number.
  let idealLabel: React.ReactNode = null;
  if (effectiveIdealPopulation) {
    const idealX = xScale(effectiveIdealPopulation);
    const text = `Ideal ${formatNumber(effectiveIdealPopulation, NUMBER_FORMATS.STRING)}`;
    const approxCharWidth = 8;
    const labelWidth = text.length * approxCharWidth;
    const tickValues: number[] = xScale.ticks(2);
    const collidesWithTicks = (x0: number, x1: number) =>
      tickValues.some(t => {
        const tickText = formatNumber(t, NUMBER_FORMATS.COMPACT) ?? '';
        const halfTickWidth = (tickText.length * approxCharWidth) / 2;
        const tickX = xScale(t);
        return x0 < tickX + halfTickWidth && x1 > tickX - halfTickWidth;
      });
    const fitsRight =
      idealX + 5 + labelWidth <= xMax && !collidesWithTicks(idealX + 5, idealX + 5 + labelWidth);
    const anchor = fitsRight ? 'start' : 'end';
    const x = fitsRight ? idealX + 5 : idealX - 5;
    idealLabel = (
      <text
        x={x}
        y={lineY - 11}
        textAnchor={anchor}
        fontSize="14px"
        stroke="var(--color-background)"
        strokeWidth={4}
        style={{paintOrder: 'stroke'}}
      >
        {text}
      </text>
    );
  }

  return (
    <svg width={width} height={POP_CHART_AXIS_HEIGHT} style={{display: 'block'}}>
      <Group left={margins.left}>
        {/* Occasionally, the "nice" formatting makes part of the axis missing */}
        <Line from={{x: 0, y: lineY}} to={{x: xMax, y: lineY}} stroke="black" />
        <AxisTop
          scale={xScale}
          top={lineY}
          numTicks={2}
          tickLabelProps={{
            fontSize: '14px',
          }}
          tickFormat={v => formatNumber(v as number, NUMBER_FORMATS.COMPACT)}
        />
        {idealLabel}
      </Group>
    </svg>
  );
};

export const PopulationChart: React.FC<{
  width: number;
  height: number;
  data: Array<SummaryRecord>;
  margins?: ChartMargins;
  idealPopulation?: number;
  onBarSelect?: (zone: number) => void;
}> = ({width, height, data, idealPopulation, onBarSelect, margins = DEFAULT_MARGINS}) => {
  const chartOptions = useChartStore(state => state.chartOptions);
  const colorScheme = useColorScheme();
  const getZoneColor = useZoneColorGetter();

  const {
    popTargetPopDeviation: targetDeviation,
    popShowPopNumbers: showPopNumbers,
    popShowTopBottomDeviation: showTopBottomDeviation,
  } = chartOptions;
  const {xScale, xMax, effectiveIdealPopulation, maxPop, isCommunityMode} = usePopulationXScale(
    width,
    data,
    idealPopulation,
    margins
  );
  const effectiveTargetDeviation = isCommunityMode ? undefined : targetDeviation;
  const effectiveShowTopBottomDeviation = isCommunityMode ? false : showTopBottomDeviation;
  const yMax = height - margins.top - margins.bottom;
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
  const renderIdealReference = () => {
    if (!effectiveIdealPopulation) return null;

    return (
      <>
        <Line
          from={{x: xScale(effectiveIdealPopulation), y: 0}}
          to={{
            x: xScale(effectiveIdealPopulation),
            y: yMax,
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
            y={0}
            height={yMax}
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

  return (
    <svg
      width={width}
      height={height}
      style={{position: 'relative', display: 'block'}}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredIndex(null);
      }}
    >
      <Group left={margins.left} top={margins.top} onMouseLeave={() => setHoveredIndex(null)}>
        {renderIdealReference()}
        {renderBars()}
      </Group>
    </svg>
  );
};
