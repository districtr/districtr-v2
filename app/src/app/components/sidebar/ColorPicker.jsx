import React, { useState } from "react";
import { palette, color10 } from "../../constants/colors";
import { Button } from "@radix-ui/themes";
import { styled } from "@stitches/react";

export function ColorPicker() {
  const [color, setColor] = useState(null);
  const [open, setOpen] = useState(false);
  const colorArray = color10;
  if (!colorArray) return null;

  return (
    <div>
      {colorArray.map((color, i) => (
        <StyledColorPicker
          key={i}
          style={{ backgroundColor: color }}
          onClick={() => setColor(color)}
        />
      ))}
    </div>
  );
}

const StyledColorPicker = styled(Button, {
  width: 20,
  height: 20,
  borderRadius: 10,
  marginRight: 5,
});
