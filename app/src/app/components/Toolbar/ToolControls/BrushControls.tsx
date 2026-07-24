import {Flex, Button, Text} from '@radix-ui/themes';
import {LockClosedIcon, LockOpen2Icon, MaskOffIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useZonePopulations} from '@/app/hooks/useDemography';
import {BrushSizeSelector} from '@components/Toolbar/ToolControls/BrushSizeSelector';
import {ZonePicker} from '@components/Toolbar/ZonePicker';
import {CurrentDistrictCard} from '@components/Toolbar/CurrentDistrictCard';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {MAP_MODES} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';

/** One-tap lock for everything already drawn: locks every district that has
 * assigned areas, so new painting can't disturb finished work. */
const LockPaintedToggle = () => {
  const {populationData} = useZonePopulations();
  const lockPaintedAreas = useMapControlsStore(state => state.mapOptions.lockPaintedAreas);
  const setLockedZones = useMapControlsStore(state => state.setLockedZones);
  const access = useMapStore(state => state.mapStatus?.access);
  const painted = populationData.filter(d => (d.total_pop_20 ?? 0) > 0).map(d => d.zone);
  const locked = painted.length > 0 && painted.every(zone => lockPaintedAreas.includes(zone));
  // ponytail: snapshot lock — districts painted after toggling stay unlocked
  // until the button is tapped again; auto-tracking if users expect it.
  const toggle = () => setLockedZones(locked ? [] : painted);
  return (
    <Button
      size="1"
      variant={locked ? 'solid' : 'surface'}
      color="gray"
      highContrast={locked}
      onClick={toggle}
      disabled={access === ACCESS_STATES.READ || painted.length === 0}
      style={{alignSelf: 'start'}}
      aria-pressed={locked}
    >
      {locked ? <LockClosedIcon /> : <LockOpen2Icon />}
      Lock painted
    </Button>
  );
};

export const BrushControls = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const showZonePicker =
    activeTool === ACTIVE_TOOLS.BRUSH ||
    // Break paints blocks, so it keeps the full paint controls.
    activeTool === ACTIVE_TOOLS.SHATTER ||
    (mapMode === MAP_MODES.COI && activeTool === ACTIVE_TOOLS.ERASER);

  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      <BrushSizeSelector />
      {mapMode === MAP_MODES.DISTRICTS && <LockPaintedToggle />}
      {showZonePicker ? (
        mapMode === MAP_MODES.DISTRICTS ? (
          // Concept 1a: the picker lives inside a card naming the district
          // being painted, with its fill state and per-district actions.
          <CurrentDistrictCard>
            <ZonePicker />
          </CurrentDistrictCard>
        ) : (
          <Flex direction="row" flexGrow={'0'} maxWidth={'100%'} p="0" m="0">
            <ZonePicker />
          </Flex>
        )
      ) : null}

      {paintConstraint && (
        <Button variant="outline" color="orange" onClick={clearPaintConstraint}>
          <Flex justify="between" align="center" gap="2">
            <Text size="2">Release paint mask</Text>
            <MaskOffIcon />
          </Flex>
        </Button>
      )}
    </Flex>
  );
};
