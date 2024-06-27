import React from "react";
import { Select } from "@radix-ui/themes";
import { useZoneStore } from "../store/zoneStore";

export function ZoneTypeSelector() {
  const { selectedZone, setSelectedZone } = useZoneStore();

  const handlePickerValueChange = (value) => {
    setSelectedZone(value);
  };

  const options = [
    { value: "1", label: "First Zone" },
    { value: "2", label: "Second Zone" },
    { value: "3", label: "Third Zone" },
  ];

  return (
    <Select.Root
      size="3"
      defaultValue="1"
      label="Zone Type"
      onValueChange={handlePickerValueChange}
    >
      <Select.Trigger />
      <Select.Content>
        <Select.Group>
          <Select.Label>Select a zone to paint</Select.Label>
          {options.map((option, idx) => (
            <Select.Item key={idx} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  );
}
