import {useMapStore} from '../store/mapStore';
import {BrushSizeSelector} from './Toolbar/BrushSizeSelector';
import {MobileColorPicker} from './Toolbar/MobileColorPicker';
import PaintByCounty from './Toolbar/PaintByCounty';
import {ZonePicker} from './Toolbar/ZonePicker';

export const BrushControls = () => {
  const activeTool = useMapStore(state => state.activeTool);

  return (
    <div
      className="gap-4 lg:gap-0 landscape:gap-0
  flex flex-row-reverse lg:flex-col landscape:flex-col
  justify-around
  min-w-60
  "
    >
      <div className="flex-grow">
        <BrushSizeSelector />
        <PaintByCounty />{' '}
      </div>
      {activeTool === 'brush' ? (
        <div className="flex-grow-0 flex-row">
          <span className="hidden md:block landscape:block">
            <ZonePicker />
          </span>
          <span className="md:hidden landscape:hidden">
            <MobileColorPicker />
          </span>
        </div>
      ) : null}
    </div>
  );
};
