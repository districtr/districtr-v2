import {
  Button,
  Text,
  DropdownMenu,
  Flex,
  Heading,
  IconButton,
  Box,
  Tooltip,
  Tabs,
} from '@radix-ui/themes';
import React, { useRef } from 'react';
import {useMapStore} from '../store/mapStore';
import {RecentMapsModal} from './Toolbar/RecentMapsModal';
import {ToolSettings} from './Toolbar/Settings';
import {ArrowLeftIcon, GearIcon, HamburgerMenuIcon} from '@radix-ui/react-icons';
import {useTemporalStore} from '../store/temporalStore';
import {document} from '../utils/api/mutations';
import {DistrictrMap} from '../utils/api/apiHandlers';
import {defaultPanels} from '@components/sidebar/DataPanelUtils';

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
      <Flex direction="column" className="h-auto">
        <Flex
          dir="row"
          className="border-b-[1px] border-gray-500 lg:shadow-xl p-1 pl-5 pr-2 relative"
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
              <DropdownMenu.Item disabled>Export Assignments</DropdownMenu.Item>
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
            <Box className="absolute right-0 lg:right-[-1px] top-full lg:max-w-64 w-full lg:w-[50vw] z-10 bg-white p-4 border-gray-500 border-[1px] lg:max-h-[50vh] overflow-y-auto overflow-x-hidden">
              <ToolSettings />
            </Box>
          )}
        </Flex>
        <MobileDataTabs />
      </Flex>
      <RecentMapsModal open={recentMapsModalOpen} onClose={() => setRecentMapsModalOpen(false)} />
    </>
  );
};

const mobileTabPanels = [
  {
    title: 'map',
    label: 'Map',
    content: null,
  },
  ...defaultPanels,
];

export const MobileDataTabs: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState(mobileTabPanels[0].title);
  const activePanel = mobileTabPanels?.find(panel => panel.title === activeTab);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const tabContainerBottom = tabContainerRef.current?.getBoundingClientRect()?.bottom || 80
  return (
    <>
      <div className="block shadow-xl border-b-[1px] border-gray-500 lg:hidden" ref={tabContainerRef}>
        <Tabs.Root defaultValue="account" value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List justify={"center"}>
            {mobileTabPanels.map(f => (
              <Tabs.Trigger key={f.title} value={f.title}>
                {f.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* <Box pt="3">
            <Tabs.Content value="account">
              <Text size="2">Make changes to your account.</Text>
            </Tabs.Content>

            <Tabs.Content value="documents">
              <Text size="2">Access and update your documents.</Text>
            </Tabs.Content>

            <Tabs.Content value="settings">
              <Text size="2">Edit your profile or update contact information.</Text>
            </Tabs.Content>
          </Box> */}
        </Tabs.Root>
      </div>
      {!!activePanel?.content && (
        <div className="absolute w-full left-0 z-[10000] bg-white overflow-y-auto p-4"
          style={{
            top: tabContainerBottom,
            height: `calc(100vh - ${tabContainerBottom}px)`,
          }}
        >{activePanel.content}</div>
      )}
    </>
  );
};
