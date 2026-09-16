import {Slider, Flex, Heading, Text, Box, Kbd} from '@radix-ui/themes';
import {useAltHeld} from '@/app/hooks/useAltHeld';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useEffect} from 'react';
import {ACCESS_STATES} from '@constants/document/state';
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
  // Same reveal gesture as the tool buttons' hotkey badges: hints show only
  // while Alt/Option is held. They flank the thumb because that is what the
  // keys do — nudge the value left or right.
  const showHotkeyHints = useAltHeld();
  const thumbPct = ((brushSize - BRUSH_MIN_SIZE) / (BRUSH_MAX_SIZE - BRUSH_MIN_SIZE)) * 100;
  // The thumb's travel is inset by half its width at each end, so its center
  // sits at pct% + (0.5 - pct) * thumbWidth of the track, not at raw pct%.
  // Size-3 thumb = track (space-2 * 1.25 = 10px) + space-1 (4px) = 14px.
  const SLIDER_THUMB_WIDTH = 14;
  const HINT_GAP = 14;
  const thumbCorrection = (0.5 - thumbPct / 100) * SLIDER_THUMB_WIDTH;

  const handleChangeEnd = (value: Array<number>) => {
    setBrushSize(value.length ? value[0] : 0);
  };
  const handlePlusMinus = (change: number) => {
    // Read fresh state: the keydown effect below binds once ([] deps), so a
    // closure over the `brushSize` prop would be stale after the first press.
    let newValue = useMapControlsStore.getState().brushSize + change;
    if (newValue > BRUSH_MAX_SIZE) {
      newValue = BRUSH_MAX_SIZE;
    } else if (newValue < BRUSH_MIN_SIZE) {
      newValue = BRUSH_MIN_SIZE;
    }
    setBrushSize(newValue);
  };

  useEffect(() => {
    // [ reduces the brush size, ] increases it
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
        <Text size="2">Brush Size</Text>
        <Flex direction="row" gapX="2" mb="3" align="center" width="100%">
          <Box position="relative" width="100%">
            <Slider
              defaultValue={[brushSize]}
              size="3"
              value={[brushSize]}
              onValueChange={access === ACCESS_STATES.READ ? () => {} : handleChangeEnd}
              min={BRUSH_MIN_SIZE}
              max={BRUSH_MAX_SIZE}
              disabled={access === ACCESS_STATES.READ}
              style={
                {
                  '--gray-a3': 'var(--gray-a6)',
                  '--gray-a5': 'var(--gray-a8)',
                } as React.CSSProperties
              }
            />
            {showHotkeyHints && (
              <>
                <Kbd
                  size="1"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    // Anchored by its right edge so the gap to the thumb
                    // mirrors "]" exactly, whatever width the glyph renders
                    // at. Constant gap even past the track ends; the key that
                    // can do nothing there is dimmed.
                    right: `calc(${100 - thumbPct}% + ${HINT_GAP - thumbCorrection}px)`,
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    opacity: brushSize <= BRUSH_MIN_SIZE ? 0 : 1,
                  }}
                >
                  [
                </Kbd>
                <Kbd
                  size="1"
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: `calc(${thumbPct}% + ${HINT_GAP + thumbCorrection}px)`,
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    opacity: brushSize >= BRUSH_MAX_SIZE ? 0 : 1,
                  }}
                >
                  ]
                </Kbd>
              </>
            )}
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
}
