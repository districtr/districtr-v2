import { useMapStore } from "@/app/store/mapStore";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { BarChart, Bar, ResponsiveContainer,  Tooltip, XAxis, YAxis, Cell } from "recharts";
import { color10 } from "@/app/constants/colors";

export const HorizontalBar = () => {
  const mapMetrics = useMapStore((state) => ({
    ...state.mapMetrics,
  }));
  const numberFormat = new Intl.NumberFormat("en-US");

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
        height={color10.length * 18}
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
          <Tooltip formatter={(value, name, props) => value.toLocaleString()} />
          <Bar dataKey="total_pop">
            {mapMetrics.data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={color10[entry.zone - 1]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Flex>
  );
};
