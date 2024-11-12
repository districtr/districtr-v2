import {Box, Flex, Heading} from '@radix-ui/themes';
import {MapModeSelector} from './MapModeSelector';
import {ColorPicker} from './ColorPicker';
import {ResetMapButton} from './ResetMapButton';
import {GerryDBViewSelector} from './GerryDBViewSelector';
import {HorizontalBar} from './charts/HorizontalBarChart';
import {useMapStore} from '@/app/store/mapStore';
import {Tabs, Text} from '@radix-ui/themes';
import Layers from './Layers';
import React from 'react';

interface DataPanelSpec {
  title: string;
  label: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
}

interface DataPanelsProps {
  defaultPanel?: string;
  panels?: DataPanelSpec[];
}

const defaultPanels: DataPanelSpec[] = [
  {
    title: 'population',
    label: 'Population',
    content: <HorizontalBar />,
  },
  {
    title: 'layers',
    label: 'Data layers',
    content: <Layers />,
  },
  {
    title: 'evaluation',
    label: 'Evaluation',
    content: <Text size="2"> Unimplemented </Text>,
  },
];

const DataPanels: React.FC<DataPanelsProps> = ({
  defaultPanel = defaultPanels[0].title,
  panels = defaultPanels,
}) => {
  return (
    <Tabs.Root defaultValue={defaultPanel}>
      <Tabs.List>
        {panels.map(panel => (
          <Tabs.Trigger key={panel.title} value={panel.title}>
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
