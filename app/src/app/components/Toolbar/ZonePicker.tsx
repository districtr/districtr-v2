import {DistrictsZonePicker} from './DistrictZonePicker';
import {CoiZonePicker} from './CoiZonePicker';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

export const ZonePicker: React.FC = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  switch (mapMode) {
    case 'districts':
      return <DistrictsZonePicker />;
    case 'coi':
      return <CoiZonePicker />;
    default:
      return null;
  }
};
