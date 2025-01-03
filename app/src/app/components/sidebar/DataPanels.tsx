import {Box} from '@radix-ui/themes';
import Evaluation from '@components/sidebar/Evaluation';
import PopulationPanel from '@components/sidebar/PopulationPanel';
import {Tabs} from '@radix-ui/themes';
import Layers from './Layers';
import React from 'react';
import {useMapStore} from '@/app/store/mapStore';

interface DataPanelSpec {
  title: string;
  label: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
}

interface DataPanelsProps {
  panels?: DataPanelSpec[];
}

const defaultPanels: DataPanelSpec[] = [
  {
    title: 'population',
    label: 'Population',
    content: <PopulationPanel />,
  },
  {
    title: 'layers',
    label: 'Data layers',
    content: <Layers />,
  },
  {
    title: 'evaluation',
    label: 'Evaluation',
    content: <Evaluation />,
  },
];

const DataPanels: React.FC<DataPanelsProps> = ({
  panels = defaultPanels,
}) => {
  const sidebarPanel = useMapStore(state => state.sidebarPanel);
  const setSidebarPanel = useMapStore(state => state.setSidebarPanel);
  return (
    <Tabs.Root value={sidebarPanel}>
      <Tabs.List>
        {panels.map(panel => (
          <Tabs.Trigger
            key={panel.title}
            value={panel.title}
            onClick={_ => setSidebarPanel(panel.title as any)}
          >
            {panel.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Box pt="3">
        {panels.map(panel => (
          <Tabs.Content key={panel.title} value={panel.title}>
            {panel.content}
          </Tabs.Content>
        ))}
      </Box>
    </Tabs.Root>
  );
};

export default DataPanels;
