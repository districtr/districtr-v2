import React, { useState } from "react";
import { palette, color10 } from "../../constants/colors";
import { Button } from "@radix-ui/themes";
import { styled } from "@stitches/react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { blackA } from "@radix-ui/colors";
import { useMapStore } from "../../store/mapStore";

export function ColorPicker() {
  const [color, setColor] = useState(null);
  const [open, setOpen] = useState(false);
  const {
    selectedZone,
    setSelectedZone,
    setZoneAssignments,
    accumulatedGeoids,
  } = useMapStore((state) => ({
    selectedZone: state.selectedZone,
    setSelectedZone: state.setSelectedZone,
    setZoneAssignments: state.setZoneAssignments,
    accumulatedGeoids: state.accumulatedGeoids,
  }));
  const colorArray = color10;
  if (!colorArray) return null;
  const handleRadioChange = (value) => {
    console.log(
      "setting accumulated geoids to old zone",
      selectedZone,
      "new zone is",
      value
    );
    setZoneAssignments(selectedZone, accumulatedGeoids);
    setSelectedZone(value);
  };
  return (
    <div>
      <RadioGroupRoot
        onValueChange={handleRadioChange}
        defaultValue={colorArray[0]}
      >
        {colorArray.map((color, i) => (
          <RadioGroupItem
            key={i}
            style={{ backgroundColor: color }}
            value={color}
          >
            <RadioGroupIndicator />
          </RadioGroupItem>
        ))}
      </RadioGroupRoot>
    </div>
  );
}

const StyledColorPicker = styled(Button, {
  width: 25,
  height: 25,
  borderRadius: 10,
  margin: 5,
  "&:selected": {
    border: "2px solid",
  },
});

const RadioGroupItem = styled(RadioGroup.Item, {
  width: 20,
  height: 20,
  borderRadius: "100%",
  "&:hover": { backgroundColor: blackA.blackA4 },
  "&:focus": { boxShadow: `0 0 0 2px black` },
  margin: 2.5,
  alignItems: "center",
  border: "1px solid #ccc",
  borderRadius: "8px",
  cursor: "pointer",
});

const RadioGroupIndicator = styled(RadioGroup.Indicator, {
  // display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
  position: "relative",
  textAlign: "-webkit-center",
  "&::after": {
    content: '""',
    display: "block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "#fff",
  },
});

const RadioGroupRoot = styled(RadioGroup.Root, {});
