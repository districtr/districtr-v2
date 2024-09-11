import React from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { styled } from "@stitches/react";
import { blackA } from "@radix-ui/colors";
import { useMapStore } from "../../store/mapStore";
import { RadioCards, Box } from "@radix-ui/themes";
import { EraserIcon, Pencil2Icon, HandIcon } from "@radix-ui/react-icons";

export function MapModeSelector() {
  const mapStore = useMapStore.getState();
  const { activeTool, setActiveTool } = useMapStore((state) => ({
    activeTool: state.activeTool,
    setActiveTool: state.setActiveTool,
  }));

  if (!activeTool) return null;
  const activeTools = [
    { mode: "pan", disabled: false, label: "Pan", icon: <HandIcon /> },
    { mode: "brush", disabled: false, label: "Brush", icon: <Pencil2Icon /> },
    { mode: "eraser", disabled: false, label: "Erase", icon: <EraserIcon /> },
  ];

  const handleRadioChange = (value) => {
    setActiveTool(value);
  };

  return (
    <Box>
      <RadioCards.Root
        defaultValue="default"
        value={activeTool}
        onValueChange={handleRadioChange}
        columns={{ initial: "1", sm: "3" }}
      >
        {activeTools.map((tool) => (
          <Flex key={`${tool.mode}-flex`}>
            <RadioCards.Item
              value={tool.mode}
              id={tool.mode}
              disabled={tool.disabled}
            >
              {tool.icon}
              {tool.label}
            </RadioCards.Item>
          </Flex>
        ))}
      </RadioCards.Root>
    </Box>
  );
}

const RadioGroupRoot = styled(RadioGroup.Root, {
  display: "grid",
  flexDirection: "column",
  gap: 10,
});

const RadioGroupItem = styled(RadioGroup.Item, {
  display: "grid",
  alignItems: "center",
  padding: "1rem",
  border: "1px solid #ccc",
  borderRadius: "8px",
  cursor: "pointer",
});

const Flex = styled("div", { display: "grid" });
