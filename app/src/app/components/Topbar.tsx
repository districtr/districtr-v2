import {
  Button,
  Text,
  DropdownMenu,
  Flex,
  Heading,
  IconButton,
  Box,
  Tooltip,
} from '@radix-ui/themes';
import React from 'react';
import {GerryDBViewSelector} from './sidebar/GerryDBViewSelector';
import {useMapStore} from '../store/mapStore';
import {RecentMapsModal} from './Toolbar/RecentMapsModal';
import {ToolSettings} from './Toolbar/Settings';
import {ArrowLeftIcon, GearIcon, HamburgerMenuIcon} from '@radix-ui/react-icons';
import {ToolUtilities} from './Toolbar/ToolUtilities';
import {useTemporalStore} from '../store/temporalStore';
import {document} from '../utils/api/mutations';
import {DistrictrMap} from '../utils/api/apiHandlers';

export const Topbar: React.FC = () => {
  const handleReset = useMapStore(state => state.handleReset);
  const [recentMapsModalOpen, setRecentMapsModalOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapViews = useMapStore(state => state.mapViews);

  const clear = useTemporalStore(store => store.clear);
  const {data} = mapViews || {};
  const handleSelectMap = (selectedMap: DistrictrMap) => {
    if (selectedMap.gerrydb_table_name === mapDocument?.gerrydb_table) {
      console.log('No document or same document');
      return;
    }
    clear();
    document.mutate({gerrydb_table: selectedMap.gerrydb_table_name});
  };

  return (
    <>
      <Flex
        dir="row"
        className="border-b-2 border-gray-500 shadow-xl p-1 pl-5 pr-2 relative"
        gap="4"
        align={'center'}
        justify={'between'}
      >
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="ml-2">
            <IconButton variant="ghost">
              <HamburgerMenuIcon className="mr-2" />
              <Heading size="3">Districtr</Heading>
              {!mapDocument?.document_id && (
                <>
                  <ArrowLeftIcon fontSize={12} color="green" className="ml-2" />
                  <Text size="1" className="italic" color="green">
                    start here!
                  </Text>
                </>
              )}
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            <DropdownMenu.Sub>
              <Tooltip open={!mapDocument?.document_id} content="Start by selecting a geography">
                <DropdownMenu.SubTrigger>Select Map</DropdownMenu.SubTrigger>
              </Tooltip>
              <DropdownMenu.SubContent>
                {data?.length ? (
                  data?.map((view, index) => (
                    <DropdownMenu.Item key={index} onClick={() => handleSelectMap(view)}>
                      {view.name}
                    </DropdownMenu.Item>
                  ))
                ) : (
                  <DropdownMenu.Item disabled>Loading geographies...</DropdownMenu.Item>
                )}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
            <DropdownMenu.Item disabled>Export Assignments (Coming Soon!)</DropdownMenu.Item>
            <DropdownMenu.Item onClick={() => setRecentMapsModalOpen(true)}>
              View Recent Maps
            </DropdownMenu.Item>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger disabled={!mapDocument?.document_id}>
                Reset Map
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent>
                <Text size="2" className="w-[50vw] max-w-60 p-3">
                  Are you sure? This will reset all zone assignments and broken geographies.{' '}
                  <b>Resetting your map cannot be undone.</b>
                </Text>
                <DropdownMenu.Item onClick={handleReset} color="red">
                  Reset Map
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <Flex direction="row" align="center" gapX="2">
          <Button variant="outline" className="mr-2" disabled>
            Share
          </Button>
          <IconButton
            variant={settingsOpen ? 'solid' : 'outline'}
            onClick={() => setSettingsOpen(prev => !prev)}
          >
            <GearIcon width="28" height="28" className="p-1" />
          </IconButton>
        </Flex>
        {settingsOpen && (
          <Box
            className="absolute right-[-2px] top-full max-w-64 w-[50vw] z-10 bg-white p-4 border-gray-500 border-2 max-h-[50vh] overflow-y-auto overflow-x-hidden"
            style={{}}
          >
            <ToolSettings />
          </Box>
        )}
      </Flex>
      <RecentMapsModal open={recentMapsModalOpen} onClose={() => setRecentMapsModalOpen(false)} />
    </>
  );
};

// <Tooltip open={!mapDocument?.document_id} content="Start by selecting a geography"></Tooltip>

// </Tooltip>
