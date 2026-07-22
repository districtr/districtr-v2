import {Slider, Flex, Text, Button, Tooltip} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useFeatureFlagStore} from '@store/featureFlagStore';
import {useToolbarStore} from '@store/toolbarStore';
import {useEffect, type CSSProperties} from 'react';
import {ACCESS_STATES} from '@constants/document/state';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import PaintByCounty, {useCountyBrush} from '@components/Toolbar/PaintByCounty';
const BRUSH_MIN_SIZE = 1;
const BRUSH_MAX_SIZE = 100;
// Concept 1a: named presets so first-timers don't face a bare 1–100 number.
// The slider stays for fine control.
const BRUSH_PRESETS = [
  {label: 'S', value: 10},
  {label: 'M', value: 50},
  {label: 'L', value: 90},
];
// Every button in the preset track (PaintByCounty keeps its own copy): fixed
// border-box height so ghost/solid toggles don't reflow (ghost is content-box
// by default), margin 0 to cancel ghost's negative alignment margins, and a
// hairline outline that active states override with a lift shadow.
const PRESET_BUTTON_STYLE: CSSProperties = {
  height: 24,
  boxSizing: 'border-box',
  margin: 0,
  borderRadius: 7,
  boxShadow: 'inset 0 0 0 1px var(--gray-a6)',
};
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
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const {paintByCounty, setCountyBrush} = useCountyBrush();
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const superDraw = useToolbarStore(state => state.superDraw);
  const canBreak = useMapStore(state => Boolean(state.mapDocument?.child_layer));

  const handleBlocks = () => {
    // Entering break mode; county painting is meaningless at block scale.
    if (paintByCounty) setCountyBrush(false);
    setActiveTool(ACTIVE_TOOLS.SHATTER);
  };

  const handleChangeEnd = (value: Array<number>) => {
    // Sizing the brush means painting by units again.
    if (paintByCounty) setCountyBrush(false);
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
      style={access === ACCESS_STATES.READ ? {pointerEvents: 'none', opacity: 0.5} : {}}
    >
      <Flex direction="column" width="100%" gap="1">
        <Flex direction="row" gapX="2" align="center" width="100%">
          <Text size="2" style={{flexShrink: 0}}>
            Brush Size
          </Text>
          <Flex flexShrink="0" align="center" className="segmented-track">
            {superDraw && canBreak && (
              <Tooltip content="Break a unit into census blocks and paint them individually">
                <Button
                  size="1"
                  variant="ghost"
                  color="gray"
                  className="tool-button"
                  style={PRESET_BUTTON_STYLE}
                  onClick={handleBlocks}
                  disabled={access === ACCESS_STATES.READ}
                >
                  Blocks
                </Button>
              </Tooltip>
            )}
            {BRUSH_PRESETS.map(preset => {
              const isActive = !paintByCounty && brushSize === preset.value;
              return (
                <Button
                  key={preset.label}
                  size="1"
                  variant={isActive ? 'solid' : 'ghost'}
                  color={isActive ? undefined : 'gray'}
                  className="tool-button"
                  style={{
                    ...PRESET_BUTTON_STYLE,
                    ...(isActive ? {boxShadow: '0 1px 3px var(--gray-a7)'} : {}),
                  }}
                  onClick={() => {
                    if (paintByCounty) setCountyBrush(false);
                    setBrushSize(preset.value);
                  }}
                  disabled={access === ACCESS_STATES.READ}
                  aria-label={`Brush size ${preset.label}: ${preset.value}`}
                >
                  {preset.label}
                </Button>
              );
            })}
            {paintCounties && <PaintByCounty />}
          </Flex>
          <Slider
            defaultValue={[brushSize]}
            size="3"
            value={[brushSize]}
            onValueChange={access === ACCESS_STATES.READ ? () => {} : handleChangeEnd}
            min={BRUSH_MIN_SIZE}
            max={BRUSH_MAX_SIZE}
            disabled={access === ACCESS_STATES.READ}
            radius="full"
            // ponytail: rail uses --gray-a3/a5; bump locally for a more visible passive state
            // Grayed (but still usable — dragging it exits county mode) while
            // the county brush is on.
            style={
              {
                '--gray-a3': 'var(--gray-a6)',
                '--gray-a5': 'var(--gray-a8)',
                opacity: paintByCounty ? 0.4 : 1,
                transition: 'opacity 120ms ease',
              } as React.CSSProperties
            }
          />
          <Text
            size="2"
            as="span"
            color="gray"
            style={{
              // Reserve three digits so the row doesn't shift as the value changes.
              minWidth: '3ch',
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              opacity: paintByCounty ? 0.4 : 1,
            }}
          >
            {brushSize}
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}
