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
import React, {useMemo, useCallback} from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';
import {Bar, Line} from '@visx/shape';
import {scaleLinear} from '@visx/scale';
import {AxisBottom} from '@visx/axis';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import {Popover} from '@radix-ui/themes';
import {GearIcon} from '@radix-ui/react-icons';
import {InfoTip} from '../../Tooltip/Tooltip';
import { ChartStore, useChartStore } from '@/app/store/chartStore';
type TooltipInput = {
  active?: boolean;
  payload?: [{payload: {total_pop: number; zone: number}}];
};

const calculateMinMaxRange = (data: Array<{zone: number; total_pop: number}>) => {
  const totalPops = data.map(item => item.total_pop);
  const min = Math.min(...totalPops);
  const max = Math.max(...totalPops);
  const range = Math.abs(max - min);
  return {min, max, range};
};

const numberFormat = new Intl.NumberFormat('en-US');

const CustomTooltip = ({active, payload: items}: TooltipInput) => {
  if (active && items && items.length) {
    const payload = items[0].payload;
    return (
      <Card>
        <span>({payload.zone}) Population: </span>
        <span>{numberFormat.format(payload.total_pop)}</span>
      </Card>
    );
  }
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
  margins = {left: 15, right: 40, top: 20, bottom: 40},
  showDistrictrNumbers = true,
  showPopNumber = true,
}) => {
  const [xMax, yMax] = [
    width - margins.left - margins.right,
    height - margins.top - margins.bottom,
  ];
  const xMaxValue = scaleToCurrent
    ? Math.max(...data.map(r => r.total_pop)) + 20
    : Math.max(idealPopulation || 0, ...data.map(r => r.total_pop));
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

  return (
    <svg width={width} height={height}>
      <Group left={margins.left} top={margins.top}>
        {!!idealPopulation && (
          <>
            <Line
              from={{x: xScale(idealPopulation), y: -margins.top}}
              to={{
                x: xScale(idealPopulation),
                y: height - margins.top - margins.bottom,
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
                y={0}
                height={yMax}
                fill="green"
                fillOpacity={0.15}
              />
            )}
          </>
        )}
        {data.map((entry, index) => (
          <>
            {entry.total_pop > 0 && (
              <Bar
                key={`bar-${entry.zone}`}
                x={0}
                y={yScale(index) + 5}
                width={xScale(entry.total_pop)}
                height={barHeight}
                fill={colorScheme[entry.zone - 1]}
                fillOpacity={0.9}
              />
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
        {/* <AxisLeft scale={yScale} /> */}
        <AxisBottom
          scale={xScale}
          top={yMax}
          numTicks={2}
          tickLabelProps={{
            fontSize: '14px',
          }}
          tickFormat={v => formatNumber(v, 'string')}
        />
      </Group>
    </svg>
  );
};

export const PopulationDataPanelOptions: React.FC<{
  chartOptions: ChartStore['chartOptions'],
  setChartOptions: ChartStore['setChartOptions'],
}> = ({
  chartOptions, setChartOptions
}) => {
  return         <Popover.Root>
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
        chartOptions.popShowDistrictNumbers? 'numbers' : '',
        chartOptions.popShowPopNumbers ? 'pops' : '',
      ]}
    >
      <CheckboxGroup.Item
        value="pops"
        onClick={() => setChartOptions({popShowPopNumbers: !chartOptions.popShowPopNumbers })}
      >
        Show population numbers
      </CheckboxGroup.Item>
      <CheckboxGroup.Item
        value="numbers"
        onClick={() => setChartOptions({popShowDistrictNumbers: !chartOptions.popShowDistrictNumbers })}
      >
        Show district zone numbers
      </CheckboxGroup.Item>
    </CheckboxGroup.Root>
    <Flex direction="column" gap="1" py="2" mt="2">
      <Text size="2">
        X-Axis bar scaling
        <InfoTip tips="barScaling" />
      </Text>
      <Flex direction="row" align="center" gap="2">
        <Radio
          name="Scale bars default"
          value="default"
          checked={!chartOptions.popBarScaleToCurrent}
          onClick={() => setChartOptions({popBarScaleToCurrent: !chartOptions.popBarScaleToCurrent })}
        />
        <Text size={'2'}>Scale bars from zero to ideal (default)</Text>
      </Flex>
      <Flex direction="row" align="center" gap="2">
        <Radio
          name="Scale bars to zone populations"
          value="zones"
          checked={chartOptions.popBarScaleToCurrent}
          onClick={() => setChartOptions({popBarScaleToCurrent: !chartOptions.popBarScaleToCurrent })}
        />
        <Text size={'2'}>Scale bars to current zone population range</Text>
      </Flex>
    </Flex>
  </Popover.Content>
</Popover.Root>
}

export const PopulationDataPanel = () => {
  const mapMetrics = useChartStore(state => state.mapMetrics);
  const summaryStats = useMapStore(state => state.summaryStats);
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts);
  const idealPopulation = summaryStats?.idealpop?.data;
  const lockPaintedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const chartOptions = useChartStore(state => state.chartOptions)
  const setChartOptions = useChartStore(state => state.setChartOptions)
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
        <PopulationDataPanelOptions 
          chartOptions={chartOptions} 
          setChartOptions={setChartOptions}
          />
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
      <Flex direction={'row'} justify={'between'} align={'center'}>
        <Text>Ideal Population: {formatNumber(idealPopulation, 'string')}</Text>
        <Flex direction="row" align="center" gapX="2">
          <Text>Target maximum population deviation</Text>
          <TextField.Root
            placeholder="Population Margin"
            type="number"
            value={chartOptions.popTargetPopDeviation || 0}
            onChange={e => setChartOptions({popTargetPopDeviation: +e.target.value})}
          ></TextField.Root>
        </Flex>
      </Flex>
      <Text>
        Top-to-bottom populationdeviation
        {stats?.range !== undefined
          ? `: ${formatNumber(stats.range || 0, 'string')}`
          : ' will appear when all districts are started'}{' '}
        <InfoTip tips="topToBottomDeviation" />
      </Text>
    </Flex>
  );
};