import React from "react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { styled } from "@stitches/react";
import { violet, blackA } from "@radix-ui/colors";
import { useMapStore } from "../../store/mapStore";

export function MapModeSelector() {
  const mapStore = useMapStore.getState();
  const { activeTool, setActiveTool } = useMapStore((state) => ({
    activeTool: state.activeTool,
    setActiveTool: state.setActiveTool,
  }));

  if (!activeTool) return null;
  const activeTools = ["pan", "brush", "erase"];

  const handleRadioChange = (value) => {
    console.log("setting active tool to", value);
    setActiveTool(value);
  };

  return (
    <form>
      <RadioGroupRoot
        defaultValue="default"
        aria-label="View density"
        value={activeTool}
        onValueChange={handleRadioChange}
      >
        {activeTools.map((tool) => (
          <Flex css={{ alignItems: "center" }} key={`${tool}-flex`}>
            <RadioGroupItem value={tool} id={tool}>
              <RadioGroupIndicator />
            </RadioGroupItem>
            <Label htmlFor={tool}>{tool}</Label>
          </Flex>
        ))}
      </RadioGroupRoot>
    </form>
  );
}

const RadioGroupRoot = styled(RadioGroup.Root, {
  display: "flex",
  flexDirection: "column",
  gap: 10,
});

const RadioGroupItem = styled(RadioGroup.Item, {
  all: "unset",
  backgroundColor: "white",
  width: 25,
  height: 25,
  borderRadius: "100%",
  boxShadow: `0 2px 10px ${blackA.blackA4}`,
  "&:hover": { backgroundColor: violet.violet3 },
  "&:focus": { boxShadow: `0 0 0 2px black` },
});

const RadioGroupIndicator = styled(RadioGroup.Indicator, {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  position: "relative",
  "&::after": {
    content: '""',
    display: "block",
    width: 11,
    height: 11,
    borderRadius: "50%",
    backgroundColor: violet.violet11,
  },
});

const Flex = styled("div", { display: "flex" });

const Label = styled("label", {
  color: "black",
  fontSize: 15,
  lineHeight: 1,
  paddingLeft: 15,
});
