import {Checkbox, Flex, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ACCESS_STATES} from '@constants/document/state';
import {MAP_MODES} from '@constants/map/mode';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

export default function DisallowPaintOver() {
  const disallowPaintOver = useMapControlsStore(state => state.mapOptions.disallowPaintOver);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const access = useMapStore(state => state.mapStatus?.access);
  const disabled = access === ACCESS_STATES.READ;

  if (mapMode === MAP_MODES.COI) return null;

  const handleToggle = () => {
    if (disabled) return;
    setMapOptions({
      disallowPaintOver: !disallowPaintOver,
    });
  };

  return (
    <HelpTip tip="disallowPaintOver" openDelay={HELP_TIP_HOVER_DELAY}>
      <Text as="label" size="2" className="cursor-pointer select-none">
        <Flex gap="2" align="center">
          <Checkbox
            checked={!!disallowPaintOver}
            onCheckedChange={handleToggle}
            disabled={disabled}
          />
          Disallow paint-over
        </Flex>
      </Text>
    </HelpTip>
  );
}
