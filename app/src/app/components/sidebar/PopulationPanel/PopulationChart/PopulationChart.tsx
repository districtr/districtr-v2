import {useMapControlsStore} from '@/app/store/mapControlsStore';
import React, {useMemo, useState} from 'react';
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

type ChartMargins = {left: number; right: number; top: number; bottom: number};
/** Margins shared by the chart body, the label strip, and the axis strip. */
export const POP_CHART_MARGINS: ChartMargins = {left: 5, right: 20, top: 6, bottom: 0};

/** Total chart height for a given row count — the single source of truth the panel must
 *  use to size the chart's container, so bar spacing always equals rowHeight. */
export const getChartHeight = (
  count: number,
  rowHeight: number,
  margins: ChartMargins = POP_CHART_MARGINS
) => count * rowHeight + margins.top + margins.bottom;

/** Height of the standalone bottom-axis strip rendered by PopulationChartAxis. */
export const POP_CHART_AXIS_HEIGHT = 36;
/** Height of the standalone "Ideal" label strip rendered by PopulationChartIdealLabel. */
export const POP_CHART_LABEL_HEIGHT = 22;

/**
 * y of the first bar's center, measured from the top of the chart svg. Bars are drawn at
 * yScale(i) + 5 with height (rowHeight - 6), so the center of bar i lands at
 * marginTop + 5 + (rowHeight - 6) / 2 + i * rowHeight. A sibling column that stacks
 * fixed-height rows can align its row centers to the bars with a top spacer of
 * getBarCenterY(marginTop, rowHeight) - rowHeight / 2.
 */
export const getBarCenterY = (marginTop: number, rowHeight: number) =>
  marginTop + 5 + (rowHeight - 6) / 2;

// The axis strip and the bar chart are separate components (the axis sits below the
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
 * Standalone "Ideal <population>" label strip, centered on the ideal reference position
 * and clamped to the chart edges. Rendered above the (possibly scrollable) bar rows so
 * the label never scrolls.
 */
export const PopulationChartIdealLabel: React.FC<{
  width: number;
  data: Array<SummaryRecord>;
  idealPopulation?: number;
  margins?: ChartMargins;
}> = ({width, data, idealPopulation, margins = POP_CHART_MARGINS}) => {
  const {xScale, xMax, effectiveIdealPopulation} = usePopulationXScale(
    width,
    data,
    idealPopulation,
    margins
  );
  if (xMax <= 0 || !data.length || !effectiveIdealPopulation) return null;
  const idealX = xScale(effectiveIdealPopulation);
  const text = `Ideal ${formatNumber(effectiveIdealPopulation, NUMBER_FORMATS.STRING)}`;
  // ~8px/char at 14px font
  const halfWidth = (text.length * 8) / 2;
  const x = Math.min(Math.max(idealX, halfWidth), xMax - halfWidth);
  return (
    <svg width={width} height={POP_CHART_LABEL_HEIGHT} style={{display: 'block'}}>
      <Group left={margins.left}>
        <text x={x} y={POP_CHART_LABEL_HEIGHT - 6} textAnchor="middle" fontSize="14px">
          {text}
        </text>
      </Group>
    </svg>
  );
};

/**
 * Standalone bottom axis strip. Rendered below the (possibly scrollable) bar rows so
 * the axis never scrolls and never competes with the scrollbar or the rows.
 */
export const PopulationChartAxis: React.FC<{
  width: number;
  data: Array<SummaryRecord>;
  idealPopulation?: number;
  margins?: ChartMargins;
}> = ({width, data, idealPopulation, margins = POP_CHART_MARGINS}) => {
  const {xScale, xMax} = usePopulationXScale(width, data, idealPopulation, margins);
  if (xMax <= 0 || !data.length) return null;
  return (
    <svg width={width} height={POP_CHART_AXIS_HEIGHT} style={{display: 'block'}}>
      <Group left={margins.left} top={1}>
        {/* Occasionally, the "nice" formatting makes part of the axis missing */}
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
  );
};

export const PopulationChart: React.FC<{
  width: number;
  /** Height of each bar row. The chart derives its own total height from this, so bar
   *  spacing matches sibling columns that stack rows of the same height. */
  rowHeight: number;
  data: Array<SummaryRecord>;
  margins?: ChartMargins;
  idealPopulation?: number;
  onBarSelect?: (zone: number) => void;
}> = ({width, rowHeight, data, idealPopulation, onBarSelect, margins = POP_CHART_MARGINS}) => {
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
  const height = getChartHeight(data.length, rowHeight, margins);
  const yMax = data.length * rowHeight;
  const barHeight = rowHeight - 6;

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
      style={{display: 'block'}}
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
