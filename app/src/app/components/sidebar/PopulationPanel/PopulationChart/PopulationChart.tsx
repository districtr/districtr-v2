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

const ROW_HEIGHT = 38;
const margins = {left: 5, right: 20, top: 20, bottom: 80};

export const PopulationChart: React.FC<{
  width: number;
  data: Array<SummaryRecord>;
  idealPopulation?: number;
  leftColumnWidth: number;
  topLeftContent?: React.ReactNode;
  leftColumnContent: React.ReactNode;
  scrollableMaxHeight?: string;
}> = ({
  width,
  data,
  idealPopulation,
  leftColumnWidth,
  topLeftContent,
  leftColumnContent,
  scrollableMaxHeight = '35vh',
}) => {
  const chartOptions = useChartStore(state => state.chartOptions);
  const colorScheme = useColorScheme();
  const setSelectedZone = useMapControlsStore(state => state.setSelectedZone);

  const {
    popBarScaleToCurrent: scaleToCurrent,
    popTargetPopDeviation: targetDeviation,
    popShowPopNumbers: showPopNumbers,
    popShowTopBottomDeviation: showTopBottomDeviation,
  } = chartOptions;

  const [xMax, barsAreaWidth] = [
    width - margins.left - margins.right,
    width,
  ];
  const barsAreaHeight = data.length * ROW_HEIGHT;
  const maxPop = Math.max(...data.map(r => r.total_pop_20));
  const xMaxValue = scaleToCurrent
    ? maxPop * 1.05
    : Math.max((idealPopulation || 0) * 1.3, ...data.map(r => r.total_pop_20 * 1.2));
  const xMinValue = scaleToCurrent ? Math.min(...data.map(r => r.total_pop_20)) : 0;

  const xScale = useCallback(
    scaleLinear<number>({
      domain: [xMinValue, xMaxValue],
      range: [xMinValue > 0 ? 100 : 0, width - margins.left - margins.right],
      nice: true,
    }),
    [width, xMaxValue, xMinValue]
  );

  const barHeight = ROW_HEIGHT - 6;

  const yScale = useCallback(
    scaleLinear({
      domain: [0, data.length],
      range: [0, barsAreaHeight],
    }),
    [data.length, barsAreaHeight]
  );

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  if (xMax < 0) {
    return null;
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', width: '100%'}}>
      {/* Fixed top: Ideal label */}
      <div
        style={{
          flexShrink: 0,
          height: margins.top,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{width: leftColumnWidth, flexShrink: 0, display: 'flex', justifyContent: 'flex-end'}}>
          {topLeftContent}
        </div>
        <svg width={width} height={margins.top} style={{overflow: 'visible'}}>
          <Group left={margins.left} top={0}>
            {!!idealPopulation && (
              <Group left={xScale(idealPopulation) + 5} top={2}>
                <text textAnchor="start" fontSize="14px">
                  Ideal{' '}
                  {isHovered ? (
                    <tspan fill="gray">{formatNumber(idealPopulation, 'string')}</tspan>
                  ) : null}
                </text>
              </Group>
            )}
          </Group>
        </svg>
      </div>

      {/* Scrollable middle: population bars */}
      <div
        style={{
          maxHeight: scrollableMaxHeight,
          overflowY: 'auto',
          flexShrink: 1,
          minHeight: 0,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setHoveredIndex(null);
        }}
      >
        <div style={{display: 'flex', flexDirection: 'row'}}>
          <div style={{width: leftColumnWidth, flexShrink: 0}}>{leftColumnContent}</div>
          <svg
            width={barsAreaWidth}
            height={barsAreaHeight}
            style={{position: 'relative', flexShrink: 0}}
          >
            <Group left={margins.left} top={0} onMouseLeave={() => setHoveredIndex(null)}>
              {!!idealPopulation && (
                <>
                  <Line
                    from={{x: xScale(idealPopulation), y: 0}}
                    to={{x: xScale(idealPopulation), y: barsAreaHeight}}
                    stroke="black"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  {!!targetDeviation && (
                    <Bar
                      x={xScale(Math.max(0, idealPopulation - targetDeviation))}
                      width={
                        xScale(Math.max(0, idealPopulation + targetDeviation)) -
                        xScale(Math.max(0, idealPopulation - targetDeviation))
                      }
                      y={0}
                      height={barsAreaHeight}
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
                        onClick={() => setSelectedZone(entry.zone)}
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
                        fill={colorScheme[entry.zone - 1]}
                        fillOpacity={0.9}
                        style={{pointerEvents: 'none'}}
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
                        idealPopulation,
                        index,
                        barHeight,
                        isHovered,
                        showPopNumbers,
                        showTopBottomDeviation,
                        width,
                      }}
                    />
                  )}
                </React.Fragment>
              ))}
            </Group>
          </svg>
        </div>
      </div>

      {/* Fixed bottom: axis */}
      <div
        style={{
          flexShrink: 0,
          height: margins.bottom,
          display: 'flex',
          alignItems: 'flex-start',
        }}
      >
        <div style={{width: leftColumnWidth, flexShrink: 0}} />
        <svg width={width} height={margins.bottom} style={{overflow: 'visible'}}>
          <Group left={margins.left} top={0}>
            <Line from={{x: 0, y: 6}} to={{x: xMax, y: 6}} stroke="black" />
            <AxisBottom
              scale={xScale}
              top={6}
              numTicks={2}
              tickLabelProps={{fontSize: '14px'}}
              tickFormat={v => formatNumber(v as number, 'compact')}
            />
          </Group>
        </svg>
      </div>
    </div>
  );
};
