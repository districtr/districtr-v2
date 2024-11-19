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

type TooltipInput = {
  active?: boolean;
  payload?: [{payload: {total_pop: number; zone: number}}];
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

  useMemo(() => {
    if (mapMetrics) {
      console.log(numDistricts, idealPopulation);
      const chartObject = calculateChartObject();
      setTotalExpectedBars(chartObject);
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
        Population by District
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
          <Bar dataKey="total_pop">
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
    </Flex>
  );
};
