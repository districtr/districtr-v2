import { Slider, Flex } from "@radix-ui/themes";
import { useMapStore } from "../../store/mapStore";

export function BrushSizeSelector() {
  const { brushSize, setBrushSize } = useMapStore((state) => ({
    brushSize: state.brushSize,
    setBrushSize: state.setBrushSize,
  }));

  const handleChangeEnd = (value: Array<number>) => {
    console.log("the final value size is", value);
    setBrushSize(value.length ? value[0] : 0);
  };

  return (
    <Flex direction="row" gap="4" maxWidth="300px" style={{alignItems:'center'}}>
        <h4>Brush Size</h4>
      <Slider
        defaultValue={[brushSize]}
        size="2"
        onValueChange={handleChangeEnd}
        min={1}
        max={100}
      />
      {brushSize}
    </Flex>
  );
}
