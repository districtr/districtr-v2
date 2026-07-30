'use client';
import {Button, Tooltip} from '@radix-ui/themes';
import {LockClosedIcon, LockOpen2Icon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {MAP_MODES} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';

/** Freeze switch for everything already drawn: while on, the brush only lands
 * on unassigned areas — nothing painted can be painted over, whatever district
 * it belongs to. Erasing still works, so mistakes stay fixable. */
export const LockPaintedToggle = () => {
  const locked = useMapControlsStore(state => state.mapOptions.lockAssignedAreas ?? false);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const access = useMapStore(state => state.mapStatus?.access);

  if (mapMode !== MAP_MODES.DISTRICTS || !isEditing) return null;
  return (
    <Tooltip content="Protect all assigned areas from being painted over; only unassigned areas accept paint. Erasing still works.">
      <Button
        size="1"
        variant={locked ? 'solid' : 'surface'}
        color="gray"
        highContrast={locked}
        onClick={() => setMapOptions({lockAssignedAreas: !locked})}
        disabled={access === ACCESS_STATES.READ}
        aria-pressed={locked}
      >
        {locked ? <LockClosedIcon /> : <LockOpen2Icon />}
        Lock painted
      </Button>
    </Tooltip>
  );
};
