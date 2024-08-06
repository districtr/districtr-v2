import React from "react";
import { Select } from "@radix-ui/themes";
import { gerryDBView, getGerryDBViews } from "../api/apiHandlers";
import { useMapStore } from "../store/mapStore";

export function GerryDBViewSelector() {
  const [views, setViews] = React.useState<gerryDBView[]>([]);
  const [selectedView, setSelectedView] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState<number>(20);
  const [offset, setOffset] = React.useState<number>(0);
  const { selectedLayer, setSelectedLayer } = useMapStore();

  React.useEffect(() => {
    getGerryDBViews(limit, offset).then((views) => {
      console.log(views);
      setViews(views);
    });
  }, [limit, offset]);

  const handleValueChange = (value: string) => {
    console.log(value);
    setSelectedView(value);
    const selectedLayer = views.find((view) => view.table_name === value);
    if (!selectedLayer) {
      return;
    }
    setSelectedLayer(selectedLayer);
  };

  if (views.length === 0) {
    return <div>Loading geographies... 🌎</div>;
  }

  return (
    <Select.Root
      size="3"
      defaultValue={selectedLayer?.table_name}
      onValueChange={handleValueChange}
    >
      <Select.Trigger />
      <Select.Content>
        <Select.Group>
          <Select.Label>Select a geography</Select.Label>
          {views.map((view, index) => (
            <Select.Item key={index} value={view.table_name}>
              {view.table_name}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}
