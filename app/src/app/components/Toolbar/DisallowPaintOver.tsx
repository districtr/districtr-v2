import {Card, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ACCESS_STATES} from '@constants/document/state';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

export default function DisallowPaintOver() {
  const disallowPaintOver = useMapControlsStore(state => state.mapOptions.disallowPaintOver);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);
  const disabled = access === ACCESS_STATES.READ;

  const handleToggle = () => {
    if (disabled) return;
    setMapOptions({
      disallowPaintOver: !disallowPaintOver,
    });
  };

  return (
    <HelpTip tip="disallowPaintOver" openDelay={HELP_TIP_HOVER_DELAY}>
      <Card
        size="1"
        className={`p-1 w-fit ${disallowPaintOver ? 'bg-indigo-50' : ''}`}
        style={disabled ? {opacity: 0.5} : undefined}
      >
        <Text
          as="label"
          size="2"
          className={disabled ? 'select-none' : 'cursor-pointer select-none'}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-pressed={!!disallowPaintOver}
          aria-disabled={disabled}
          onClick={handleToggle}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggle();
            }
          }}
        >
          Disallow paint over
        </Text>
      </Card>
    </HelpTip>
  );
}
