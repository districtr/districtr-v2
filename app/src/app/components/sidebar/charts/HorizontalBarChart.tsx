import {useMapStore} from '@/app/store/mapStore';
import {Card, Flex, Heading, Text} from '@radix-ui/themes';
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  ReferenceLine,
  Label,
} from 'recharts';
import {colorScheme} from '@/app/constants/colors';
import {useState, useMemo} from 'react';
import { formatNumber } from '@/app/utils/numbers';

type TooltipInput = {
  active?: boolean;
  payload?: [{payload: {total_pop: number; zone: number}}];
};

const calculateMinMaxRange = (data: Array<{zone: number; total_pop: number}>) => {
  const totalPops = data.map(item => item.total_pop);
  const min = Math.min(...totalPops);
  const max = Math.max(...totalPops);
  const range = Math.abs(max - min);
  return { min, max, range };
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

export const HorizontalBar = () => {
  const mapMetrics = useMapStore(state => state.mapMetrics);
  const summaryStats = useMapStore(state => state.summaryStats);
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts);
  const idealPopulation = summaryStats?.idealpop?.data;
  const maxNumberOrderedBars = 40; // max number of zones to consider while keeping blank spaces for missing zones
  const [totalExpectedBars, setTotalExpectedBars] = useState<
    Array<{zone: number; total_pop: number}>
  >([]);

  const calculateChartObject = () => {
    if ((numDistricts ?? 0) < maxNumberOrderedBars) {
      return mapMetrics && mapMetrics.data && numDistricts
        ? Array.from({length: numDistricts}, (_, i) => i + 1).reduce(
            (acc, district) => {
              const totalPop = mapMetrics.data.reduce((acc, entry) => {
                return entry.zone === district ? acc + entry.total_pop : acc;
              }, 0);
              return [...acc, {zone: district, total_pop: totalPop}];
            },
            [] as Array<{zone: number; total_pop: number}>
          )
        : [];
    } else {
      return mapMetrics?.data ?? [];
    }
  };

  const stats = useMemo(() => {
    if (mapMetrics) {
      const chartObject = calculateChartObject();
      const allAreNonZero = chartObject.every(entry => entry.total_pop > 0)
      const stats = allAreNonZero ? calculateMinMaxRange(chartObject) : undefined
      setTotalExpectedBars(chartObject);
      return stats
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
      <Heading as="h3" size="3">
        Population by district
      </Heading>
      <ResponsiveContainer width="100%" minHeight="350px">
        <BarChart
          width={500}
          data={totalExpectedBars}
          layout="vertical"
          barGap={0.5}
          maxBarSize={50}
        >
          <XAxis
            allowDataOverflow={true}
            type="number"
            domain={[
              0,
              (dataMax: number) =>
                idealPopulation
                  ? Math.round(Math.max(idealPopulation * 2, dataMax + 1000))
                  : dataMax,
            ]}
            tickFormatter={value => numberFormat.format(value)}
          />
          <YAxis type="category" hide allowDataOverflow={true} padding={{bottom: 40}} />
          <Tooltip content={<CustomTooltip />} />
          {/* @ts-ignore types are wrong, this works  */}
          <Bar dataKey="total_pop" label={renderCustomBarLabel}>
            {totalExpectedBars &&
              totalExpectedBars
                .sort((a, b) => a.zone - b.zone)
                .map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colorScheme[entry.zone - 1]} />
                ))}
          </Bar>
          <ReferenceLine x={idealPopulation ?? 0} stroke="black" strokeDasharray="3 3">
          <Label
              value={`Ideal: ${new Intl.NumberFormat('en-US').format(
                Math.round(idealPopulation ?? 0) ?? 0
              )}`}
              position="insideBottomLeft"
              fill="black"
              fontSize={18}
              offset={10}
            />
          </ReferenceLine>
        </BarChart>
      </ResponsiveContainer>
      {stats?.range !== undefined && <Text>
      Top-to-bottom deviation: {formatNumber(stats.range || 0, 'string')}
      </Text>}
    </Flex>
  );
};


const renderCustomBarLabel: React.FC<any> = ({ y, height, index, value }) => {
  const entryIsLocked = useMapStore(state => Array.isArray(state.mapOptions.lockPaintedAreas) && state.mapOptions.lockPaintedAreas.indexOf(index+1) !== -1)
  if (!entryIsLocked || !value) {
    return null
  }
  return <g transform={`translate(${10}, ${y+height/2-9}), scale(1.25)`}>
    <path d="M5 4.63601C5 3.76031 5.24219 3.1054 5.64323 2.67357C6.03934 2.24705 6.64582 1.9783 7.5014 1.9783C8.35745 1.9783 8.96306 2.24652 9.35823 2.67208C9.75838 3.10299 10 3.75708 10 4.63325V5.99999H5V4.63601ZM4 5.99999V4.63601C4 3.58148 4.29339 2.65754 4.91049 1.99307C5.53252 1.32329 6.42675 0.978302 7.5014 0.978302C8.57583 0.978302 9.46952 1.32233 10.091 1.99162C10.7076 2.65557 11 3.57896 11 4.63325V5.99999H12C12.5523 5.99999 13 6.44771 13 6.99999V13C13 13.5523 12.5523 14 12 14H3C2.44772 14 2 13.5523 2 13V6.99999C2 6.44771 2.44772 5.99999 3 5.99999H4ZM3 6.99999H12V13H3V6.99999Z" fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"></path>
  </g>;
};