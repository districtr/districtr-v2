import {useMapStore} from '../store/mapStore';
import {BrushSizeSelector} from './Toolbar/BrushSizeSelector';
import PaintByCounty from './Toolbar/PaintByCounty';
import {ZonePicker} from './Toolbar/ZonePicker';
export const BrushControls = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const mapDocumentStatus = useMapStore(state => state.mapDocument?.status);

  return (
    <div className="gap-0 flex flex-col justify-around min-w-60">
      <div className="flex-grow">
        <BrushSizeSelector />
        <PaintByCounty />{' '}
      </div>
      {activeTool === 'brush' ? (
        <div className="flex-grow-0 flex-row p-0 m-0">
          <ZonePicker />
        </div>
      ) : null}
    </div>
  );
};
