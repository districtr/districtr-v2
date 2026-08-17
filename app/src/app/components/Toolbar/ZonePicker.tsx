import {DistrictsZonePicker} from './DistrictZonePicker';
import {CoiZonePicker} from './CoiZonePicker';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';

export const ZonePicker: React.FC<{disabled?: boolean}> = ({disabled}) => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  switch (mapMode) {
    case MAP_MODES.DISTRICTS:
      return <DistrictsZonePicker disabled={disabled} />;
    case MAP_MODES.COI:
      return <CoiZonePicker disabled={disabled} />;
    default:
      return null;
  }
};
