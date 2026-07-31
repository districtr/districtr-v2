import {Card, Checkbox, Flex, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useUiHintStore} from '@/app/store/uiHintStore';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {ACCESS_STATES} from '@constants/document/state';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

export default function PaintByCounty() {
  const mapRef = useMapStore(state => state.getMapRef());
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const paintByCounty = useMapControlsStore(state => state.mapOptions.paintByCounty);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const activeTool = useMapControlsStore(state => state.activeTool);
  const inBlockView = useMapStore(state => state.captiveIds.size > 0);
  // Break picks one unit and block-scale painting has no counties to paint by.
  // Toggling here would also swap the break tool's single-feature selector for
  // the county one, so the next break click would shatter the whole county.
  // handleShatter turns the brush off on entry; this keeps it off until exit.
  const lockedForBreak = activeTool === ACTIVE_TOOLS.SHATTER || inBlockView;
  const disabled = access === ACCESS_STATES.READ || lockedForBreak;
  // The helper's "paint by counties" hint pulses this control.
  const flashing = useUiHintStore(state => state.flashTarget === 'county-brush');

  const handleToggle = () => {
    if (!mapRef) return;
    setMapOptions({
      paintByCounty: !paintByCounty,
    });
    if (!paintByCounty) {
      // Clear overlay constraint when enabling county paint
      clearPaintConstraint();
      setPaintFunction(getFeaturesIntersectingCounties);
    } else {
      setPaintFunction(getFeaturesInBbox);
    }
  };

  return (
    <HelpTip
      tip="countyBrush"
      openDelay={HELP_TIP_HOVER_DELAY}
      text={lockedForBreak ? 'Unavailable while breaking a unit into blocks' : undefined}
    >
      <Card
        size="1"
        className={`${paintByCounty ? 'bg-indigo-50' : ''} ${flashing ? 'ui-flash' : ''}`}
        style={lockedForBreak ? {opacity: 0.5} : undefined}
      >
        <Text as="label" size="2" className="cursor-pointer select-none">
          <Flex gap="2" align="center">
            <Checkbox checked={paintByCounty} onCheckedChange={handleToggle} disabled={disabled} />
            County Brush
          </Flex>
        </Text>
      </Card>
    </HelpTip>
  );
}
