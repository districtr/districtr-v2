import { useMapStore } from "@/app/store/mapStore";
import { Card, Flex, Heading, Text } from "@radix-ui/themes";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { colorScheme } from "@/app/constants/colors";

type TooltipInput = {
  active?: boolean;
  payload?: [{ payload: { total_pop: number; zone: number } }];
};

const numberFormat = new Intl.NumberFormat("en-US");

const CustomTooltip = ({ active, payload: items }: TooltipInput) => {
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
  const mapMetrics = useMapStore((state) => state.mapMetrics);

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
      <ResponsiveContainer
        width="100%"
        // should this instead be set based on the target number of zones? see https://github.com/districtr/districtr-v2/issues/92
        height={colorScheme.length * 18}
        minHeight="200px"
      >
        <BarChart
          width={500}
          data={mapMetrics.data}
          layout="vertical"
          barGap={0.5}
          maxBarSize={50}
        >
          <XAxis
            allowDataOverflow={true}
            type="number"
            domain={[0, "maxData"]}
            tickFormatter={(value) => numberFormat.format(value)}
          />
          <YAxis type="category" hide />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="total_pop">
            {mapMetrics.data
              .sort((a, b) => a.zone - b.zone)
              .map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colorScheme[entry.zone - 1]}
                />
              ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Flex>
  );
};
