import React from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { styled } from "@stitches/react";
import { useMapStore } from "@store/mapStore";
import { RadioCards, Box } from "@radix-ui/themes";
import {
  EraserIcon,
  Pencil2Icon,
  HandIcon,
  BorderSplitIcon,
} from "@radix-ui/react-icons";
import { RecentMapsModal } from "@components/sidebar/RecentMapsModal";

export function MapModeSelector() {
  const activeTool = useMapStore((state) => state.activeTool);
  const setActiveTool = useMapStore((state) => state.setActiveTool);
  const mapDocument = useMapStore((state) => state.mapDocument);

  if (!activeTool) return null;
  const activeTools = [
    { mode: "pan", disabled: false, label: "Pan", icon: <HandIcon /> },
    { mode: "brush", disabled: false, label: "Brush", icon: <Pencil2Icon /> },
    {
      mode: "eraser",
      disabled: false,
      label: "Erase",
      icon: <EraserIcon />,
    },
    {
      mode: "shatter",
      disabled: !mapDocument.child_layer,
      label: "Shatter",
      icon: <BorderSplitIcon />,
    },
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
        <RecentMapsModal />
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
