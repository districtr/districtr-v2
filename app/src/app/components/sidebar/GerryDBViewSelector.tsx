import React from "react";
import { Select } from "@radix-ui/themes";
import { gerryDBView, getGerryDBViews } from "../../api/apiHandlers";
import { useMapStore } from "../../store/mapStore";
import { useQuery } from "@tanstack/react-query";

export function GerryDBViewSelector() {
  const [selectedView, setSelectedView] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState<number>(20);
  const [offset, setOffset] = React.useState<number>(0);
  const { selectedLayer, setSelectedLayer } = useMapStore();
  const { isPending, error, data } = useQuery({
    queryKey: ["views", limit, offset],
    queryFn: () => getGerryDBViews(limit, offset),
  });

  if (isPending) {
    return <div>Loading geographies... 🌎</div>;
  }

  if (error) {
    return <div>Failed to load geographies.</div>;
  }

  const handleValueChange = (value: string) => {
    setSelectedView(value);
    const selectedLayer = data.find((view) => view.name === value);
    if (!selectedLayer) {
      return;
    }
    setSelectedLayer(selectedLayer);
  };

  return (
    <Select.Root
      size="3"
      defaultValue={selectedLayer?.name}
      onValueChange={handleValueChange}
    >
      <Select.Trigger />
      <Select.Content>
        <Select.Group>
          <Select.Label>Select a geography</Select.Label>
          {data.map((view, index) => (
            <Select.Item key={index} value={view.name}>
              {view.name}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}
