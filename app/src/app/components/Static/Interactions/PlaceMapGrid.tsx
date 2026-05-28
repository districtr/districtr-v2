'use client';
import {useState} from 'react';
import {SegmentedControl, Flex, Grid} from '@radix-ui/themes';
import {CreateButton} from './CreateButton';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {MAP_TABS, type MapTab} from '@constants/document/tabs';
import {sanitizeCommunityMaps} from '@/app/utils/communities';

export const PlaceMapGrid: React.FC<{maps: Partial<DistrictrMap>[]}> = ({maps}) => {
  const [activeTab, setActiveTab] = useState<MapTab>(MAP_TABS.DISTRICTS);
  const filteredMaps = activeTab === MAP_TABS.DISTRICTS ? maps : sanitizeCommunityMaps(maps);

  return (
    <Flex direction="column" gap="3">
      <Flex justify="center">
        <SegmentedControl.Root
          value={activeTab}
          onValueChange={v => setActiveTab(v as MapTab)}
          size="2"
        >
          <SegmentedControl.Item value={MAP_TABS.DISTRICTS}>District Plan</SegmentedControl.Item>
          <SegmentedControl.Item value={MAP_TABS.COMMUNITY}>Community Plan</SegmentedControl.Item>
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
        {filteredMaps.map((view, i) => (
          <CreateButton key={i} view={view} isCommunity={activeTab === MAP_TABS.COMMUNITY} />
        ))}
      </Grid>
    </Flex>
  );
};
