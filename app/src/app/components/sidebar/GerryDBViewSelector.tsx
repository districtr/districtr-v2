import { useEffect, useState } from "react";
import { Flex, Select } from "@radix-ui/themes";
import { getAvailableDistrictrMaps } from "../../utils/api/apiHandlers";
import { useMapStore } from "../../store/mapStore";
import { useQuery } from "@tanstack/react-query";
import { document } from "@/app/utils/api/mutations";
import { RecentMapsModal } from "./RecentMapsModal";

export function GerryDBViewSelector() {
  const [limit, setLimit] = useState<number>(30);
  const [offset, setOffset] = useState<number>(0);
  const mapDocument = useMapStore((state) => state.mapDocument);
  const mapViews = useMapStore((state) => state.mapViews);
  const { isPending, isError, data, error } = mapViews || {};

  const selectedView = data?.find(
    (view) => view.gerrydb_table_name === mapDocument?.gerrydb_table
  );

  const handleValueChange = (value: string) => {
    console.log("Value changed: ", value);
    const selectedDistrictrMap = data?.find((view) => view.name === value);
    console.log("Selected view: ", selectedDistrictrMap);
    if (
      !selectedDistrictrMap ||
      selectedDistrictrMap.gerrydb_table_name === mapDocument?.gerrydb_table
    ) {
      console.log("No document or same document");
      return;
    }
    console.log("mutating to create new document");
    document.mutate({ gerrydb_table: selectedDistrictrMap.gerrydb_table_name });
  };

  if (isPending) return <div>Loading geographies... 🌎</div>;

  if (isError) return <div>Error loading geographies: {error?.message}</div>;

  return (
    <Flex direction={"row"} width="100%" gap="3" align="center">
      <Select.Root
        size="3"
        onValueChange={handleValueChange}
        value={selectedView?.name}
      >
        <Select.Trigger
          placeholder="Select a geography"
          style={{ flexGrow: 1 }}
          className="mr-1"
        />
        <Select.Content>
          <Select.Group>
            <Select.Label>Districtr map options</Select.Label>
            {data?.map((view, index) => (
              <Select.Item key={index} value={view.name}>
                {view.name}
              </Select.Item>
            ))}
          </Select.Group>
        </Select.Content>
      </Select.Root>
      <RecentMapsModal />
    </Flex>
  );
}
