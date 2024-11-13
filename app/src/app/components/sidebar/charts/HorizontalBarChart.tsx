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
import {useEffect, useState} from 'react';
import {map, max} from 'lodash';

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
  const mapDocument = useMapStore(state => state.mapDocument);
  const [idealPopulation, setIdealPopulation] = useState<number | null>(null);
  const maxNumberOrderedBars = 40; // max number of zones to consider while keeping blank spaces for missing zones
  const [totalExpectedBars, setTotalExpectedBars] = useState<
    Array<{zone: number; total_pop: number}>
  >([]);

  useEffect(() => {
    if (mapDocument) {
      if (mapDocument.num_districts) {
        setIdealPopulation(mapDocument.total_population / mapDocument.num_districts);
      }
    }
  }, [mapDocument]);

  // note: there may be a global desire to have total zones in the object in the future.
  // if so, we can update the get_total_population pg function to return.
  const calculateChartObject = () => {
    if ((mapDocument?.num_districts ?? 0) < maxNumberOrderedBars) {
      return mapDocument && mapMetrics && mapMetrics.data && mapDocument.num_districts
        ? Array.from({length: mapDocument.num_districts}, (_, i) => i + 1).reduce(
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

  useEffect(() => {
    if (mapDocument && mapMetrics) {
      const chartObject = calculateChartObject();
      setTotalExpectedBars(chartObject);
    }
  }, [mapDocument, mapMetrics]);

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
        Population by Zone
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
          <YAxis type="category" hide allowDataOverflow={true} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total_pop">
            {totalExpectedBars &&
              totalExpectedBars
                .sort((a, b) => a.zone - b.zone)
                .map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colorScheme[entry.zone - 1]} />
                ))}
          </Bar>
          <ReferenceLine
            x={idealPopulation ?? 0}
            stroke="black"
            strokeDasharray="3 3"
            ifOverflow="extendDomain"
          >
            <Label
              value={`Ideal: ${new Intl.NumberFormat('en-US').format(
                Math.round(idealPopulation ?? 0) ?? 0
              )}`}
              position="insideBottomLeft"
              fill="black"
              fontSize={18}
            />
          </ReferenceLine>
        </BarChart>
      </ResponsiveContainer>
    </Flex>
  );
};
