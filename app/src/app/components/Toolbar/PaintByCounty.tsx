import {Button, Tooltip} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useUiHintStore} from '@/app/store/uiHintStore';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {ACCESS_STATES} from '@constants/document/state';

// Mirrors PRESET_BUTTON_STYLE in BrushSizeSelector (not imported — that file
// imports this one, and a cycle isn't worth three properties).
const PRESET_BUTTON_STYLE = {height: 24, margin: 0, borderRadius: 7};

export const COUNTY_BRUSH_FLASH_ID = 'county-brush';

/** County-brush state + setter, shared by the toolbar button and the
 * Getting Started hint that enables it remotely. */
export const useCountyBrush = () => {
  const mapRef = useMapStore(state => state.getMapRef());
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const paintByCounty = useMapControlsStore(state => state.mapOptions.paintByCounty);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);

  const setCountyBrush = (enabled: boolean) => {
    if (!mapRef) return;
    setMapOptions({
      paintByCounty: enabled,
    });
    if (enabled) {
      // Clear overlay constraint when enabling county paint
      clearPaintConstraint();
      setPaintFunction(getFeaturesIntersectingCounties);
    } else {
      setPaintFunction(getFeaturesInBbox);
    }
  };

  return {paintByCounty, setCountyBrush};
};

// A toggle button styled to sit inline with the S/M/L brush presets.
export default function PaintByCounty() {
  const {paintByCounty, setCountyBrush} = useCountyBrush();
  const access = useMapStore(state => state.mapStatus?.access);
  const flashTarget = useUiHintStore(state => state.flashTarget);

  return (
    <Tooltip content="Paint whole counties at a time">
      <Button
        size="1"
        variant={paintByCounty ? 'solid' : 'ghost'}
        color={paintByCounty ? undefined : 'gray'}
        style={{
          ...PRESET_BUTTON_STYLE,
          ...(paintByCounty ? {boxShadow: '0 1px 3px var(--gray-a7)'} : {}),
        }}
        onClick={() => setCountyBrush(!paintByCounty)}
        disabled={access === ACCESS_STATES.READ}
        className={`tool-button ${flashTarget === COUNTY_BRUSH_FLASH_ID ? 'flash-target' : ''}`}
      >
        Counties
      </Button>
    </Tooltip>
  );
}
