import { useMapStore } from "@/app/store/mapStore";
import { Flex, Heading, DataList, Text } from "@radix-ui/themes";

export const HorizontalBar = () => {
  const { mapMetrics } = useMapStore((state) => ({
    mapMetrics: state.mapMetrics,
  }));
  const numberFormat = new Intl.NumberFormat("en-US");

  if (mapMetrics?.isPending) {
    return <div>Loading...</div>;
  }

  if (mapMetrics?.isError) {
    return <div>Error: {mapMetrics?.error.message}</div>;
  }

  if (mapMetrics?.data.length === 0) {
    return <div>No data to display</div>;
  }

  return (
    <Flex gap="3" direction="column">
      <Heading as="h3" size="3">
        Population by Zone
      </Heading>
      {mapMetrics ? (
        <DataList.Root>
          {mapMetrics?.data
            .sort((a, b) => b.total_pop - a.total_pop)
            .map((metric) => (
              <DataList.Item key={metric.zone} align="center">
                <DataList.Label minWidth="32px">{metric.zone}</DataList.Label>
                <DataList.Value>
                  <Text weight="medium" as="p">
                    {numberFormat.format(metric.total_pop)}
                  </Text>
                </DataList.Value>
              </DataList.Item>
            ))}
        </DataList.Root>
      ) : (
        <Text>No data to display</Text>
      )}
    </Flex>
  );
};
