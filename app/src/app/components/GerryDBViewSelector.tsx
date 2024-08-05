import React from "react";
import { Select } from "@radix-ui/themes";
import { gerryDBView, getGerryDBViews } from "../api/apiHandlers";

export function GerryDBViewSelector() {
  const [views, setViews] = React.useState<gerryDBView[]>([]);
  const [selectedView, setSelectedView] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState<number>(10);
  const [offset, setOffset] = React.useState<number>(0);

  React.useEffect(() => {
    getGerryDBViews(limit, offset).then((views) => {
      console.log(views);
      setViews(views);
    });
  }, [limit, offset]);

  const handleValueChange = (value: string) => {
    console.log(value);
    setSelectedView(value);
  };

  if (views.length === 0) {
    return <div>Loading...</div>;
  }

  return (
    <Select.Root
      size="3"
      defaultValue="Select a geography"
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
