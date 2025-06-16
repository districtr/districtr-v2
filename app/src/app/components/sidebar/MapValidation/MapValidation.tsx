import {Flex, Tabs} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {Contiguity} from './Contiguity';
import {ZoomToUnassigned} from './ZoomToUnassigned';
import {useState} from 'react';

const mapValidationPanel = [
  {
    label: 'Contiguity',
    component: <Contiguity />,
  },
  {
    label: 'Unassigned Areas',
    component: <ZoomToUnassigned />,
  },
];
export const MapValidation = () => {
  const mapType = useMapStore(state => state.mapDocument?.map_type);
  const [activePanel, setActivePanel] = useState(
    mapValidationPanel[mapType === 'local' ? 1 : 0].label
  );
  const Component = mapValidationPanel.find(panel => panel.label === activePanel)?.component;
  return (
    <Flex direction="column" gap="2">
      <Tabs.Root value={activePanel} onValueChange={setActivePanel}>
        <Tabs.List justify={'start'}>
          {mapValidationPanel.map((panel, index) => (
            <Tabs.Trigger key={index} value={panel.label} className="text-center">
              {panel.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>
      {!!Component && Component}
    </Flex>
  );
};
