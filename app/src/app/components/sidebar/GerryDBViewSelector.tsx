import React from "react";
import { Select } from "@radix-ui/themes";
import { gerryDBView, getGerryDBViews } from "../../api/apiHandlers";
import { useMapStore } from "../../store/mapStore";
import { SetUpdateUrlParams } from "../../utils/events/mapEvents";
import { LoadMapLayer } from "@/app/utils/events/handlers";

export function GerryDBViewSelector() {
  const [views, setViews] = React.useState<gerryDBView[]>([]);
  const [selectedView, setSelectedView] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState<number>(20);
  const [offset, setOffset] = React.useState<number>(0);
  const { selectedLayer, setSelectedLayer } = useMapStore((state) => ({
    selectedLayer: state.selectedLayer,
    setSelectedLayer: state.setSelectedLayer,
  }));

  React.useEffect(() => {
    getGerryDBViews(limit, offset).then((views) => {
      console.log(views);
      setViews(views);
    });
  }, [limit, offset]);

  const handleValueChange = (value: string) => {
    setSelectedView(value);
    const selectedLayer = views.find((view) => view.name === value);
    if (!selectedLayer) {
      return;
    }
    // load the selected layer on the map
    LoadMapLayer(selectedLayer, useMapStore.getState());
    const urlParams = useMapStore.getState().urlParams;
    const router = useMapStore.getState().router;
    const pathname = useMapStore.getState().pathname;
    urlParams.set("layer", selectedLayer.name);
    SetUpdateUrlParams(router, pathname, urlParams);
  };

  if (views.length === 0) {
    return <div>Loading geographies... 🌎</div>;
  }

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
          {views.map((view, index) => (
            <Select.Item key={index} value={view.name}>
              {view.name}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}
