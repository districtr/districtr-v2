'use client';
import {useState} from 'react';
import {SegmentedControl, Flex, Grid} from '@radix-ui/themes';
import {CreateButton} from './CreateButton';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';

type MapTab = 'districts' | 'community';

export const PlaceMapGrid: React.FC<{maps: Partial<DistrictrMap>[]}> = ({maps}) => {
  const [activeTab, setActiveTab] = useState<MapTab>('districts');

  return (
    <Flex direction="column" gap="3">
      <Flex justify="center">
        <SegmentedControl.Root
          value={activeTab}
          onValueChange={v => setActiveTab(v as MapTab)}
          size="2"
        >
          <SegmentedControl.Item value="districts">District Plan</SegmentedControl.Item>
          <SegmentedControl.Item value="community">Community Plan</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Grid
        gap="2"
        columns={{
          initial: '1',
          md: '2',
          lg: '4',
        }}
      >
        {maps.map((view, i) => (
          <CreateButton key={i} view={view} isCommunity={activeTab === 'community'} />
        ))}
      </Grid>
    </Flex>
  );
};
