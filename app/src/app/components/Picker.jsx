import React from "react";
import * as Select from "@radix-ui/react-select";
import { styled } from "@stitches/react";
import { violet, mauve, blackA } from "@radix-ui/colors";
// use zustand to track state
import { useZoneStore } from "../store/zoneStore";

const ZoneTypeSelector = () => {
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
    <Select.Root value={selectedZone} onValueChange={handlePickerValueChange}>
      <SelectTrigger aria-label="zones">
        <Select.Value placeholder="Select a Zone to paint with" />
      </SelectTrigger>
      <Select.Portal>
        <SelectContent>
          <SelectViewport>
            <Select.Group>
              <SelectLabel>{"Zones"}</SelectLabel>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </Select.Group>
          </SelectViewport>
        </SelectContent>
      </Select.Portal>
    </Select.Root>
  );
};

export default ZoneTypeSelector;

const SelectTrigger = styled(Select.SelectTrigger, {
  all: "unset",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  padding: "0 15px",
  fontSize: 13,
  lineHeight: 1,
  height: 35,
  gap: 5,
  backgroundColor: "white",
  color: violet.violet11,
  boxShadow: `0 2px 10px ${blackA.blackA4}`,
  "&:hover": { backgroundColor: mauve.mauve3 },
  "&:focus": { boxShadow: `0 0 0 2px black` },
  "&[data-placeholder]": { color: violet.violet9 },
});

const SelectIcon = styled(Select.SelectIcon, {
  color: violet.violet11,
});

const SelectContent = styled(Select.Content, {
  overflow: "hidden",
  backgroundColor: "white",
  borderRadius: 6,
  boxShadow:
    "0px 10px 38px -10px rgba(22, 23, 24, 0.35), 0px 10px 20px -15px rgba(22, 23, 24, 0.2)",
});

const SelectViewport = styled(Select.Viewport, {
  padding: 5,
});

const SelectItem = React.forwardRef(({ children, ...props }, forwardedRef) => {
  return (
    <StyledItem {...props} ref={forwardedRef}>
      <Select.ItemText>{children}</Select.ItemText>
    </StyledItem>
  );
});

const StyledItem = styled(Select.Item, {
  fontSize: 13,
  lineHeight: 1,
  color: violet.violet11,
  borderRadius: 3,
  display: "flex",
  alignItems: "center",
  height: 25,
  padding: "0 35px 0 25px",
  position: "relative",
  userSelect: "none",

  "&[data-disabled]": {
    color: mauve.mauve8,
    pointerEvents: "none",
  },

  "&[data-highlighted]": {
    outline: "none",
    backgroundColor: violet.violet9,
    color: violet.violet1,
  },
});

const SelectLabel = styled(Select.Label, {
  padding: "0 25px",
  fontSize: 12,
  lineHeight: "25px",
  color: mauve.mauve11,
});

const SelectSeparator = styled(Select.Separator, {
  height: 1,
  backgroundColor: violet.violet6,
  margin: 5,
});

const StyledItemIndicator = styled(Select.ItemIndicator, {
  position: "absolute",
  left: 0,
  width: 25,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});

const scrollButtonStyles = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 25,
  backgroundColor: "white",
  color: violet.violet11,
  cursor: "default",
};

const SelectScrollUpButton = styled(Select.ScrollUpButton, scrollButtonStyles);

const SelectScrollDownButton = styled(
  Select.ScrollDownButton,
  scrollButtonStyles
);
