import {MapStore, useMapStore} from '@/app/store/mapStore';
import {Card, CheckboxGroup, Flex, Heading, IconButton, Text, TextField} from '@radix-ui/themes';
// import {
//   BarChart,
//   Bar,
//   ResponsiveContainer,
//   Tooltip,
//   XAxis,
//   YAxis,
//   Cell,
//   ReferenceLine,
//   Label,
// } from 'recharts';
import {colorScheme} from '@/app/constants/colors';
import React, {useState, useMemo, useCallback} from 'react';
import {formatNumber} from '@/app/utils/numbers';
import {Group} from '@visx/group';
import {Bar, Line} from '@visx/shape';
import {scaleLinear, scaleOrdinal} from '@visx/scale';
import {AxisLeft, AxisBottom} from '@visx/axis';
import {ParentSize} from '@visx/responsive'; // Import ParentSize
import {BrushHandleRenderProps} from '@visx/brush/lib/BrushHandle';
import {Brush} from '@visx/brush';
import {Popover} from '@radix-ui/themes';
import {GearIcon} from '@radix-ui/react-icons';
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
  scaleToDataRange?: boolean;
  popThreshold?: number;
  displayPopulationNumbers?: boolean;
  displayDistrictNumbers?: boolean;
}> = ({
  width,
  height,
  data,
  idealPopulation,
  scaleToDataRange,
  popThreshold,
  lockPaintedAreas,
  margins = {left: 10, right: 40, top: 20, bottom: 40},
  displayDistrictNumbers = true,
  displayPopulationNumbers = true,
}) => {
  const [xMax, yMax] = [
    width - margins.left - margins.right,
    height - margins.top - margins.bottom,
  ];
  const xMaxValue = scaleToDataRange
    ? Math.max(...data.map(r => r.total_pop)) + 20
    : Math.max(idealPopulation || 0, ...data.map(r => r.total_pop));
  const xMinValue = scaleToDataRange ? Math.min(...data.map(r => r.total_pop)) : 0;

  const xScale = useCallback(
    scaleLinear<number>({
      domain: [xMinValue, xMaxValue],
      range: [xMinValue > 0 ? 100 : 0, width - margins.left - margins.right],
      nice: true,
    }),
    [width, xMaxValue, xMinValue]
  );
  const barHeight = yMax / data.length - 10;

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
              from={{x: xScale(idealPopulation), y: 0}}
              to={{
                x: xScale(idealPopulation),
                y: height - margins.top - margins.bottom,
              }}
              stroke={'rgba(0,0,0,0.8)'}
              strokeWidth={'2'}
              strokeDasharray={'6 4'}
            />
            <Group left={xScale(idealPopulation) + 5} top={yMax - 5}>
              <text textAnchor="end" fontSize="14px" style={{transform: 'rotate(90deg)'}}>
                Ideal
              </text>
            </Group>
            {!!popThreshold && (
              <Bar
                x={xScale(Math.max(0, idealPopulation - popThreshold))}
                width={
                  xScale(Math.max(0, idealPopulation + popThreshold)) -
                  xScale(Math.max(0, idealPopulation - popThreshold))
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
            <Bar
              key={`bar-${entry.zone}`}
              x={0}
              y={yScale(index) + 5}
              width={xScale(entry.total_pop)}
              height={barHeight}
              fill={colorScheme[entry.zone - 1]}
              fillOpacity={0.9}
            />
            {!!displayDistrictNumbers && (
              <>
                <text
                  x={3}
                  y={yScale(index) + barHeight * 0.75}
                  fontSize={14}
                  fontWeight={'bold'}
                  stroke="white"
                  strokeWidth={2}
                >
                  {entry.zone}
                </text>
                <text x={3} y={yScale(index) + barHeight * 0.75} fontSize={14} fontWeight={'bold'}>
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
            {!!displayPopulationNumbers && (
              <>
                <text
                  x={xScale(entry.total_pop) - 5}
                  y={yScale(index) + barHeight - 4}
                  fontSize={14}
                  fontWeight={'bold'}
                  textAnchor="end"
                  stroke="white"
                  strokeWidth={2}
                >
                  {formatNumber(entry.total_pop, 'compact3')}
                </text>
                <text
                  x={xScale(entry.total_pop) - 5}
                  y={yScale(index) + barHeight - 4}
                  fontSize={14}
                  fontWeight={'bold'}
                  textAnchor="end"
                >
                  {formatNumber(entry.total_pop, 'compact3')}
                </text>
              </>
            )}
          </>
        ))}
        {/* <AxisLeft scale={yScale} /> */}
        {/* <AxisBottom
          scale={xScale}
          top={yMax}
          numTicks={4}
          tickFormat={v => formatNumber(v, 'compact3')}
        /> */}
      </Group>
    </svg>
  );
};

export const PopulationDataPanel = () => {
  const mapMetrics = useMapStore(state => state.mapMetrics);
  const summaryStats = useMapStore(state => state.summaryStats);
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts);
  const idealPopulation = summaryStats?.idealpop?.data;
  const lockPaintedAreas = useMapStore(state => state.mapOptions.lockPaintedAreas);
  const [scaleToDataRange, setScaleToDataRange] = useState(false);
  const [displayPopulationNumbers, setDisplayPopulationNumbers] = useState(true);
  const [displayDistrictNumbers, setDisplayDistrctNumbers] = useState(true);
  const [popThreshold, setPopThreshold] = useState<number>(0);
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
                scaleToDataRange ? 'scaleToDataRange' : '',
                displayDistrictNumbers ? 'numbers' : '',
                displayPopulationNumbers ? 'pops' : '',
              ]}
            >
              <CheckboxGroup.Item
                value="pops"
                onClick={() => setDisplayPopulationNumbers(prev => !prev)}
              >
                Show population numbers
              </CheckboxGroup.Item>
              <CheckboxGroup.Item
                value="numbers"
                onClick={() => setDisplayDistrctNumbers(prev => !prev)}
              >
                Show district zone numbers
              </CheckboxGroup.Item>
              <CheckboxGroup.Item
                value="scaleToDataRange"
                onClick={() => setScaleToDataRange(prev => !prev)}
              >
                Scale bars to data range
              </CheckboxGroup.Item>
            </CheckboxGroup.Root>
            <p>Margin</p>
            <TextField.Root
              placeholder="Pop threshold"
              type="number"
              value={popThreshold || 0}
              onChange={e => setPopThreshold(+e.target.value)}
            ></TextField.Root>
          </Popover.Content>
        </Popover.Root>
      </Flex>
      <ParentSize
        style={{
          minHeight: chartData.length ? `${chartData.length * 50}px` : '200px',
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
            scaleToDataRange={scaleToDataRange}
            popThreshold={popThreshold}
          />
        )}
      </ParentSize>
      <Text>
        Ideal Population: {formatNumber(idealPopulation, 'string')}
        {popThreshold ? ` +/- ${formatNumber(popThreshold, 'string')}` : ''}
      </Text>
      <Text>
        {stats?.range !== undefined
          ? `Top-to-bottom deviation: ${formatNumber(stats.range || 0, 'string')}`
          : 'Top-to-bottom population deviation will appear when all districts are started'}
      </Text>
    </Flex>
  );
};