import {DistrictsZonePicker} from './DistrictZonePicker';
import {CoiZonePicker} from './CoiZonePicker';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';

export const ZonePicker: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  switch (mapMode) {
    case MAP_MODES.DISTRICTS:
      return <DistrictsZonePicker />;
    case MAP_MODES.COI:
      return <CoiZonePicker />;
    default:
      return null;
  }
};
