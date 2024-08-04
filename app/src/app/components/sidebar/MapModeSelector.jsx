import React from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { styled } from "@stitches/react";
import { blackA } from "@radix-ui/colors";
import { useMapStore } from "../../store/mapStore";
import { RadioCards, Box } from "@radix-ui/themes";

export function MapModeSelector() {
  const mapStore = useMapStore.getState();
  const { activeTool, setActiveTool } = useMapStore((state) => ({
    activeTool: state.activeTool,
    setActiveTool: state.setActiveTool,
  }));

  if (!activeTool) return null;
  const activeTools = [
    { mode: "pan", disabled: false, label: "Pan" },
    { mode: "brush", disabled: false, label: "Brush" },
    { mode: "erase", disabled: true, label: "Erase" },
  ];

  const handleRadioChange = (value) => {
    console.log("setting active tool to", value);
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
          <Flex key={`${tool.mode}-flex`} direction="column" width="100%">
            <RadioCards.Item
              value={tool.mode}
              id={tool.mode}
              disabled={tool.disabled}
            >
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
  // all: "unset",
  // backgroundColor: "white",
  // width: 25,
  // height: 25,
  // borderRadius: "100%",
  // boxShadow: `0 2px 10px ${blackA.blackA4}`,
  // "&:hover": { backgroundColor: violet.violet3 },
  // "&:focus": { boxShadow: `0 0 0 2px black` },
  display: "grid",
  alignItems: "center",
  padding: "1rem",
  border: "1px solid #ccc",
  borderRadius: "8px",
  cursor: "pointer",
});

const Flex = styled("div", { display: "grid" });

const Label = styled("label", {
  color: "black",
  fontSize: 15,
  lineHeight: 1,
  paddingLeft: 15,
});
