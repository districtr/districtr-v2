import React, { useState } from "react";
import { palette, color10 } from "../../constants/colors";
import { Button } from "@radix-ui/themes";
import { styled } from "@stitches/react";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { blackA } from "@radix-ui/colors";

export function ColorPicker() {
  const [color, setColor] = useState(null);
  const [open, setOpen] = useState(false);
  const colorArray = color10;
  if (!colorArray) return null;

  return (
    <div>
      <RadioGroupRoot>
        {colorArray.map((color, i) => (
          <RadioGroupItem key={i} style={{ backgroundColor: color }} />
        ))}
      </RadioGroupRoot>
    </div>
  );
}

const StyledColorPicker = styled(Button, {
  width: 20,
  height: 20,
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

const RadioGroupRoot = styled(RadioGroup.Root, {});
