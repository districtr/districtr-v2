import { Slider, Flex, Heading, Text } from "@radix-ui/themes";
import { useMapStore } from "../../store/mapStore";

/**
 * BrushSizeSelector
 * Note: right now the brush size is an arbitrary value between
 * 1 and 100. This is slightly arbitrary. Should we communicate brush size
 * differently or not display the brush size?
 *
 * @description A slider to select the brush size
 * @returns {JSX.Element} The component
 */
export function BrushSizeSelector() {
  const brushSize = useMapStore((state) => state.brushSize);
  const setBrushSize = useMapStore((state) => state.setBrushSize);

  const handleChangeEnd = (value: Array<number>) => {
    console.log("the final value size is", value);
    setBrushSize(value.length ? value[0] : 0);
  };

  return (
    <Flex direction="row" gap="4" maxWidth="300px" mb="3" align="center">
      <Heading
        as="h4"
        size="2"
        weight="regular"
        style={{ whiteSpace: "nowrap" }}
      >
        Brush Size
      </Heading>
      <Slider
        defaultValue={[brushSize]}
        size="2"
        onValueChange={handleChangeEnd}
        min={1}
        max={100}
      />
      <Text size="2" as="span" color="gray">
        {brushSize}
      </Text>
    </Flex>
  );
}
