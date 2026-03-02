import {Slider, Flex, Heading, Text, IconButton} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {MinusIcon, PlusIcon} from '@radix-ui/react-icons';
import {useEffect} from 'react';
const BRUSH_MIN_SIZE = 1;
const BRUSH_MAX_SIZE = 100;
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
  const brushSize = useMapControlsStore(state => state.brushSize);
  const setBrushSize = useMapControlsStore(state => state.setBrushSize);
  const access = useMapStore(state => state.mapStatus?.access);

  const handleChangeEnd = (value: Array<number>) => {
    setBrushSize(value.length ? value[0] : 0);
  };
  const handlePlusMinus = (change: number) => {
    let newValue = brushSize + change;
    if (newValue > BRUSH_MAX_SIZE) {
      newValue = BRUSH_MAX_SIZE;
    } else if (newValue < BRUSH_MIN_SIZE) {
      newValue = BRUSH_MIN_SIZE;
    }
    setBrushSize(newValue);
  };

  useEffect(() => {
    // listen for [ or - and reduce brush size
    // listen for ] or + and increase brush size
    const handleKeyDown = (e: KeyboardEvent) => {
      // if alt shift or ctrl are pressed, ignore
      if (e.altKey || e.shiftKey || e.ctrlKey) return;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;

      if (e.key === '[') {
        handlePlusMinus(-10);
      } else if (e.key === ']') {
        handlePlusMinus(10);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <Flex
      direction="row"
      width={'100%'}
      style={access === 'read' ? {pointerEvents: 'none', opacity: 0.5} : {}}
    >
      <Flex direction="column" width="100%" gap="1">
        <Text size="1">Brush Size</Text>
        <Flex direction="row" gapX="2" mb="3" align="center" width="100%">
          <Slider
            defaultValue={[brushSize]}
            size="2"
            value={[brushSize]}
            onValueChange={access === 'read' ? () => {} : handleChangeEnd}
            min={BRUSH_MIN_SIZE}
            max={BRUSH_MAX_SIZE}
            disabled={access === 'read'}
          />
          <Text size="1" as="span" color="gray">
            {brushSize}
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}
