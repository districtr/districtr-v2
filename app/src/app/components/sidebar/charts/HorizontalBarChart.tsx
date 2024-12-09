import {MapStore, useMapStore} from '@/app/store/mapStore';
import {
  Card,
  CheckboxGroup,
  Flex,
  Heading,
  IconButton,
  Radio,
  Text,
  TextField,
} from '@radix-ui/themes';
import {colorScheme} from '@/app/constants/colors';
import React, {useMemo, useCallback, useState} from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';
import {Bar, Line} from '@visx/shape';
import {scaleLinear} from '@visx/scale';
import {AxisBottom} from '@visx/axis';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import {Popover} from '@radix-ui/themes';
import {GearIcon} from '@radix-ui/react-icons';
import {InfoTip} from '../../Tooltip/Tooltip';
import {ChartStore, useChartStore} from '@/app/store/chartStore';
type TooltipInput = {
  y: number;
  index: number;
  pop: number;
  idealPopulation?: number;
  maxPop?: number;
};

const calculateMinMaxRange = (data: Array<{zone: number; total_pop: number}>) => {
  const totalPops = data.map(item => item.total_pop);
  const min = Math.min(...totalPops);
  const max = Math.max(...totalPops);
  const range = Math.abs(max - min);
  return {min, max, range};
};

const CustomTooltip = ({y, pop, index, idealPopulation, maxPop}: TooltipInput) => {
  const deviationFromIdeal = idealPopulation ? (idealPopulation - pop) * -1 : 0;
  const deviationDir = deviationFromIdeal > 0 ? '+' : '';
  const deviationPercent = idealPopulation
    ? formatNumber(deviationFromIdeal / idealPopulation, 'percent')
    : '';

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
          {idealPopulation &&
            `Deviation from ideal: ${deviationDir}${deviationPercent} (${deviationDir}${formatNumber(deviationFromIdeal, 'string')})`}
        </Text>
      </Card>
    </foreignObject>
  );
};

const LockIcon = () => (
  <path
    d="M5 4.63601C5 3.76031 5.24219 3.1054 5.64323 2.67357C6.03934 2.24705 6.64582 1.9783 7.5014 1.9783C8.35745 1.9783 8.96306 2.24652 9.35823 2.67208C9.75838 3.10299 10 3.75708 10 4.63325V5.99999H5V4.63601ZM4 5.99999V4.63601C4 3.58148 4.29339 2.65754 4.91049 1.99307C5.53252 1.32329 6.42675 0.978302 7.5014 0.978302C8.57583 0.978302 9.46952 1.32233 10.091 1.99162C10.7076 2.65557 11 3.57896 11 4.63325V5.99999H12C12.5523 5.99999 13 6.44771 13 6.99999V13C13 13.5523 12.5523 14 12 14H3C2.44772 14 2 13.5523 2 13V6.99999C2 6.44771 2.44772 5.99999 3 5.99999H4ZM3 6.99999H12V13H3V6.99999Z"
    fill="currentColor"
    fill-rule="evenodd"
    clip-rule="evenodd"
    stroke="black"
    strokeWidth={0.5}
  ></path>
);
export const PopulationChart: React.FC<{
  width: number;
  height: number;
  data: Array<{zone: number; total_pop: number}>;
  lockPaintedAreas: MapStore['mapOptions']['lockPaintedAreas'];
  margins?: {left: number; right: number; top: number; bottom: number};
  idealPopulation?: number;
  scaleToCurrent?: boolean;
  targetDeviation?: number;
  showPopNumber?: boolean;
  showDistrictrNumbers?: boolean;
}> = ({
  width,
  height,
  data,
  idealPopulation,
  scaleToCurrent,
  targetDeviation,
  lockPaintedAreas,
  margins = {left: 15, right: 20, top: 20, bottom: 40},
  showDistrictrNumbers = true,
  showPopNumber = true,
}) => {
  const [xMax, yMax] = [
    width - margins.left - margins.right,
    height - margins.top - margins.bottom,
  ];
  const maxPop = Math.max(...data.map(r => r.total_pop));
  const xMaxValue = scaleToCurrent
    ? maxPop * 1.01
    : Math.max((idealPopulation || 0) * 1.25, ...data.map(r => r.total_pop));
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

  return (
    <svg width={width} height={height} style={{position: 'relative'}}>
      <Group left={margins.left} top={margins.top}>
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
                Ideal
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
                  onMouseEnter={() => setHoveredIndex(index)}
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
            {!!showPopNumber && entry.total_pop > 0 && (
              <>
                <text
                  x={xScale(entry.total_pop) + 5}
                  y={yScale(index) + barHeight - 4}
                  fontSize={14}
                  fontWeight={'bold'}
                  textAnchor="start"
                  stroke="white"
                  strokeWidth={2}
                >
                  {formatNumber(entry.total_pop, 'compact3')}
                </text>
                <text
                  x={xScale(entry.total_pop) + 5}
                  y={yScale(index) + barHeight - 4}
                  fontSize={14}
                  fontWeight={'bold'}
                  textAnchor="start"
                >
                  {formatNumber(entry.total_pop, 'compact3')}
                </text>
              </>
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
          <CustomTooltip
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

export const PopulationDataPanelOptions: React.FC<{
  chartOptions: ChartStore['chartOptions'];
  setChartOptions: ChartStore['setChartOptions'];
}> = ({chartOptions, setChartOptions}) => {
  return (
    <Popover.Root>
      <Popover.Trigger>
        <IconButton
          variant="ghost"
          size="3"
          aria-label="Choose map districtr assignment brush color"
        >
          <GearIcon />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content>
        <CheckboxGroup.Root
          defaultValue={[]}
          name="districts"
          value={[
            chartOptions.popBarScaleToCurrent ? 'scaleToCurrent' : '',
            chartOptions.popShowDistrictNumbers ? 'numbers' : '',
            chartOptions.popShowPopNumbers ? 'pops' : '',
          ]}
        >
          <CheckboxGroup.Item
            value="pops"
            onClick={() => setChartOptions({popShowPopNumbers: !chartOptions.popShowPopNumbers})}
            className="cursor-pointer"
          >
            Show population numbers
          </CheckboxGroup.Item>
          <CheckboxGroup.Item
            value="numbers"
            onClick={() =>
              setChartOptions({popShowDistrictNumbers: !chartOptions.popShowDistrictNumbers})
            }
            className="cursor-pointer"
          >
            Show district zone numbers
          </CheckboxGroup.Item>
        </CheckboxGroup.Root>
        <Flex direction="column" gap="1" py="2" mt="2">
          <Text size="2">
            X-Axis bar scaling
            <InfoTip tips="barScaling" />
          </Text>
          <Flex
            direction="row"
            align="center"
            gap="2"
            onClick={() =>
              setChartOptions({popBarScaleToCurrent: !chartOptions.popBarScaleToCurrent})
            }
            className="cursor-pointer"
          >
            <Radio
              name="Scale bars default"
              value="default"
              checked={!chartOptions.popBarScaleToCurrent}
            />
            <Text size={'2'}>Scale bars from zero to ideal (default)</Text>
          </Flex>
          <Flex
            direction="row"
            align="center"
            gap="2"
            onClick={() =>
              setChartOptions({popBarScaleToCurrent: !chartOptions.popBarScaleToCurrent})
            }
            className="cursor-pointer"
          >
            <Radio
              name="Scale bars to zone populations"
              value="zones"
              checked={chartOptions.popBarScaleToCurrent}
            />
            <Text size={'2'}>Scale bars to current zone population range</Text>
          </Flex>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};

export const PopulationDataPanel = () => {
  const mapMetrics = useChartStore(state => state.mapMetrics);
  const summaryStats = useMapStore(state => state.summaryStats);
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts);
  const idealPopulation = summaryStats?.idealpop?.data;
  const lockPaintedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const chartOptions = useChartStore(state => state.chartOptions);
  const setChartOptions = useChartStore(state => state.setChartOptions);
  const maxNumberOrderedBars = 40; // max number of zones to consider while keeping blank spaces for missing zones

  const {chartData, stats} = useMemo(() => {
    if (mapMetrics && mapMetrics.data && numDistricts) {
      const chartData = Array.from({length: numDistricts}, (_, i) => i + 1).reduce(
        (acc, district) => {
          const totalPop = mapMetrics.data.reduce((acc, entry) => {
            return entry.zone === district ? acc + entry.total_pop : acc;
          }, 0);
          return [...acc, {zone: district, total_pop: totalPop}];
        },
        [] as Array<{zone: number; total_pop: number}>
      );
      const allAreNonZero = chartData.every(entry => entry.total_pop > 0);
      const stats = allAreNonZero ? calculateMinMaxRange(chartData) : undefined;
      return {
        stats,
        chartData,
      };
    } else {
      return {
        stats: undefined,
        chartData: [],
      };
    }
  }, [mapMetrics]);

  if (mapMetrics?.isPending) {
    return <div>Loading...</div>;
  }

  if (mapMetrics?.isError) {
    return <div>Error: {mapMetrics?.error.message}</div>;
  }

  if (!mapMetrics || mapMetrics.data.length === 0) {
    return (
      <Text color="gray" size="2">
        No data to display
      </Text>
    );
  }

  return (
    <Flex gap="3" direction="column">
      <Flex direction="row" gap={'2'} align="center">
        <Heading as="h3" size="3">
          Total population by district
        </Heading>
        <PopulationDataPanelOptions chartOptions={chartOptions} setChartOptions={setChartOptions} />
      </Flex>
      <ParentSize
        style={{
          minHeight: chartData.length ? `${chartData.length * 40}px` : '200px',
          width: '100%',
        }}
      >
        {({width, height}) => (
          <PopulationChart
            width={width}
            height={height}
            data={chartData}
            idealPopulation={idealPopulation}
            lockPaintedAreas={lockPaintedAreas}
            scaleToCurrent={chartOptions.popBarScaleToCurrent}
            targetDeviation={chartOptions.popTargetPopDeviation}
            showPopNumber={chartOptions.popShowPopNumbers}
            showDistrictrNumbers={chartOptions.popShowDistrictNumbers}
          />
        )}
      </ParentSize>
      {!!idealPopulation && (
        <Flex direction={'row'} justify={'between'} align={'start'}>
          <Flex direction="column" gapX="2" minWidth={'10rem'}>
            <Text>Ideal Population</Text>
            <Text weight={'bold'}>{formatNumber(idealPopulation, 'string')}</Text>
          </Flex>

          <Text>
            Top-to-bottom population deviation <InfoTip tips="topToBottomDeviation" />
            <br />
            {stats?.range !== undefined ? (
              <b>{formatNumber(stats.range || 0, 'string')}</b>
            ) : (
              ' will appear when all districts are started'
            )}{' '}
          </Text>
        </Flex>
      )}
      {!!idealPopulation && (
        <Flex direction="row" align="start" gapX="2" pt="2">
          <Text>
            Max deviation target
            <InfoTip tips="maxDeviation" />
          </Text>
          <Flex direction="row" align="center" gapX="2" flexGrow={'1'}>
            <Flex direction="column" flexGrow={'1'}>
              <TextField.Root
                placeholder="% Deviation"
                type="number"
                max={100}
                step={0.1}
                value={chartOptions.popTargetPopDeviationPct || undefined}
                onChange={e => {
                  if (e.target.value === '') {
                    setChartOptions({
                      popTargetPopDeviation: undefined,
                      popTargetPopDeviationPct: undefined,
                    });
                  } else {
                    const value = Math.max(0, +e.target.value);
                    setChartOptions({
                      popTargetPopDeviation: Math.round((value / 100) * idealPopulation),
                      popTargetPopDeviationPct: value,
                    });
                  }
                }}
              ></TextField.Root>
              <Text size="1">Percent</Text>
            </Flex>
            <Flex direction="column" flexGrow={'1'}>
              <TextField.Root
                placeholder="Pop Deviation"
                type="number"
                value={chartOptions.popTargetPopDeviation || undefined}
                onChange={e => {
                  if (e.target.value === '') {
                    setChartOptions({
                      popTargetPopDeviation: undefined,
                      popTargetPopDeviationPct: undefined,
                    });
                  } else {
                    const value = Math.max(0, +e.target.value);
                    setChartOptions({
                      popTargetPopDeviation: value,
                      popTargetPopDeviationPct: Math.round((value / idealPopulation) * 10000) / 100,
                    });
                  }
                }}
              ></TextField.Root>
              <Text size="1">Population</Text>
            </Flex>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
};
