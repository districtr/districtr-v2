import React from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import {styled} from '@stitches/react';
import {useMapStore} from '@store/mapStore';
import {RadioCards, Box} from '@radix-ui/themes';
import {
  EraserIcon,
  Pencil2Icon,
  HandIcon,
  LockOpen1Icon,
  ViewGridIcon,
} from '@radix-ui/react-icons';
import {RecentMapsModal} from '@components/sidebar/RecentMapsModal';
import GeometryWorker from '@/app/utils/GeometryWorker';

export function MapModeSelector() {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const mapDocument = useMapStore(state => state.mapDocument);
  const [unassignedFeatures, setUnassignedFeatures] = React.useState([]);

  const mapRef = useMapStore(state => state.getMapRef());
  if (!activeTool) return null;
  const activeTools = [
    {mode: 'pan', disabled: false, label: 'Pan', icon: <HandIcon />},
    {mode: 'brush', disabled: false, label: 'Brush', icon: <Pencil2Icon />},
    {mode: 'eraser', disabled: false, label: 'Erase', icon: <EraserIcon />},
    {
      mode: 'shatter',
      disabled: !mapDocument?.child_layer,
      label: 'Break',
      icon: <ViewGridIcon />,
    },
    {
      mode: 'lock',
      disabled: false,
      label: 'Lock',
      icon: <LockOpen1Icon />,
    },
  ];

  const handleRadioChange = value => {
    value && setActiveTool(value);
  };

  return (
    <Box>
      <RadioCards.Root
        defaultValue="default"
        value={activeTool}
        onValueChange={handleRadioChange}
        columns={{ initial: "3" }}
      >
        {activeTools.map(tool => (
          <Flex key={`${tool.mode}-flex`}>
            <RadioCards.Item value={tool.mode} id={tool.mode} disabled={tool.disabled}>
              {tool.icon}
              {tool.label}
            </RadioCards.Item>
          </Flex>
        ))}
          <Flex>
            <RadioCards.Item value={null} id={'unassigned'} onClick={() => {
              GeometryWorker.updateProps(Array.from(useMapStore.getState().zoneAssignments.entries())).then(
                () => GeometryWorker.getUnassignedGeometries().then(
                  geometries => setUnassignedFeatures(geometries)
                )
              )
            }}>
              Zoom to unassigned
            </RadioCards.Item>
          </Flex>
        <RecentMapsModal />
      </RadioCards.Root>
      {unassignedFeatures.length > 0 && (
        <Box>
          <h3>Unassigned Features</h3>
          <ul>
            {unassignedFeatures.map((feature, index) => (
              <button key={index} 
                className="btn p-4"
              onClick={() => {
                mapRef?.fitBounds(feature.properties.bbox);
              }}>{index}</button>))}
          </ul>
        </Box>
      )}
    </Box>
  );
}

const RadioGroupRoot = styled(RadioGroup.Root, {
  display: 'grid',
  flexDirection: 'column',
  gap: 10,
});

const RadioGroupItem = styled(RadioGroup.Item, {
  display: 'grid',
  alignItems: 'center',
  padding: '1rem',
  border: '1px solid #ccc',
  borderRadius: '8px',
  cursor: 'pointer',
});

const Flex = styled('div', {display: 'grid'});
