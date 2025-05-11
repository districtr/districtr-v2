'use client';
import {
  Button,
  Badge,
  Text,
  DropdownMenu,
  Flex,
  Heading,
  IconButton,
  Link,
  Box,
  Tooltip,
  Tabs,
} from '@radix-ui/themes';
import React, {useRef} from 'react';
import {useMapStore} from '@store/mapStore';
import {RecentMapsModal} from '@components/Toolbar/RecentMapsModal';
import {ToolSettings} from '@components/Toolbar/Settings';
import {ArrowLeftIcon, GearIcon, HamburgerMenuIcon, InfoCircledIcon} from '@radix-ui/react-icons';
import {useTemporalStore} from '@store/temporalStore';
import {document} from '@utils/api/mutations';
import {DistrictrMap} from '@utils/api/apiHandlers/types';
import {defaultPanels} from '@components/sidebar/DataPanelUtils';
import {ShareMapsModal} from '@components/Toolbar/ShareMapsModal';

import {SaveMapModal} from '@/app/components/Toolbar/SaveMapModal';
import {useMapStatus} from '../hooks/useMapStatus';
import {useMapMetadata} from '../hooks/useMapMetadata';
import {PasswordPopover} from './Toolbar/PasswordPopover';
import {PasswordPromptModal} from './Toolbar/PasswordPromptModal';
import {UploaderModal} from './Toolbar/UploaderModal';

export const Topbar: React.FC = () => {
  const handleReset = useMapStore(state => state.handleReset);
  const [modalOpen, setModalOpen] = React.useState<'upload' | 'recents' | 'share' | 'save' | null>(
    null
  );
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);
  const status = useMapStore(state => state.mapStatus?.status);
  const userID = useMapStore(state => state.userID);
  const mapViews = useMapStore(state => state.mapViews);
  const passwordPrompt = useMapStore(state => state.passwordPrompt);
  const {statusText, statusColor, statusTooltip} = useMapStatus();
  const showRecentMaps = useMapStore(state => state.userMaps.length > 0);
  const mapMetadata = useMapMetadata(mapDocument?.document_id);
  const mapName = mapMetadata?.name ?? mapDocument?.map_metadata?.name ?? '';
  const mapTableName = useMapStore(
    state =>
      state.userMaps.find(userMap => userMap.document_id === state.mapDocument?.document_id)
        ?.name ?? ''
  );
  const clear = useTemporalStore(store => store.clear);
  const data = mapViews?.data || [];

  const handleSelectMap = (selectedMap: DistrictrMap) => {
    clear();
    document.mutate({
      districtr_map_slug: selectedMap.districtr_map_slug,
      user_id: userID,
    });
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
                <DropdownMenu.Item>
                  <Link href="/">Home</Link>
                </DropdownMenu.Item>
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
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger disabled={!mapDocument?.document_id}>
                  Export Assignments
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent>
                  <DropdownMenu.Item>
                    <Tooltip content="Download a CSV of Census GEOIDs and zone IDs">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?format=CSV&export_type=ZoneAssignments`}
                        download={`districtr-block-assignments-${mapDocument?.document_id}-${new Date().toDateString()}.csv`}
                      >
                        VTD Assignments (CSV)
                      </a>
                    </Tooltip>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item>
                    <Tooltip content="Download a GeoJSON of Census GEOIDs and zone IDs">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?format=GeoJSON&export_type=ZoneAssignments`}
                        download={`districtr-block-assignments-${mapDocument?.document_id}-${new Date().toDateString()}.csv`}
                      >
                        VTD Assignments (GeoJSON)
                      </a>
                    </Tooltip>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item disabled={!mapDocument?.child_layer}>
                    <Tooltip content="Download a CSV of Census Block GEOIDs and zone IDs">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?format=CSV&export_type=BlockZoneAssignments`}
                        download={`districtr-block-assignments-${mapDocument?.document_id}-${new Date().toDateString()}.csv`}
                      >
                        Block Assignment (CSV)
                      </a>
                    </Tooltip>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item>
                    <Tooltip content="Download a GeoJSON of district boundaries">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?format=GeoJSON&export_type=Districts`}
                        download={`districtr-block-assignments-${mapDocument?.document_id}-${new Date().toDateString()}.csv`}
                      >
                        District boundaries (GeoJSON)
                      </a>
                    </Tooltip>
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
              <DropdownMenu.Item onClick={() => setModalOpen('upload')}>
                Upload Block Assignments
              </DropdownMenu.Item>
              <DropdownMenu.Item onClick={() => setModalOpen('recents')} disabled={!showRecentMaps}>
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
            {/*map name */}
            <Button variant="ghost" onClick={() => setModalOpen('save')}>
              <Text size="3" className="text-black-500">
                {mapName || ''}
              </Text>
            </Button>
            {/*map slug */}
            {/*source table name */}
            <Text size="3" className="text-gray-500">
              {mapTableName || ''}
            </Text>
          </Flex>
          <Flex direction="row" align="center" gapX="2">
            {!!statusText && (
              <Button
                variant="outline"
                className="mr-2"
                disabled={!mapDocument?.document_id}
                onClick={() => setModalOpen('save')}
              >
                Save / Status
              </Button>
            )}
            {!!statusText && (
              <Button
                variant="outline"
                className="mr-2"
                disabled={!mapDocument?.document_id}
                onClick={() => setModalOpen('share')}
              >
                {status === 'locked' ? 'Share' : 'Share'}
              </Button>
            )}
            {!!statusText && (
              <Button
                variant="outline"
                className="mr-2"
                disabled={!mapDocument?.document_id}
                onClick={() => setModalOpen('recents')}
              >
                {statusText}
              </Button>
            )}
            {!!(statusText && statusColor) && (
              <Tooltip content={statusTooltip}>
                <Badge
                  color={statusColor}
                  size={'3'}
                  variant={'soft'}
                  className={statusTooltip?.length ? '' : `pointer-events-none`}
                >
                  {statusText} {!!statusTooltip?.length && <InfoCircledIcon />}
                </Badge>
              </Tooltip>
            )}
            {passwordPrompt && <PasswordPopover />}
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
      <RecentMapsModal open={modalOpen === 'recents'} onClose={() => setModalOpen(null)} />
      <ShareMapsModal open={modalOpen === 'share'} onClose={() => setModalOpen(null)} />
      <SaveMapModal open={modalOpen === 'save'} onClose={() => setModalOpen(null)} />
      <UploaderModal open={modalOpen === 'upload'} onClose={() => setModalOpen(null)} />
      <PasswordPromptModal />
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
  const tabContainerBottom = tabContainerRef.current?.getBoundingClientRect()?.bottom || 80;
  return (
    <>
      <div
        className="block shadow-xl border-b-[1px] border-gray-500 lg:hidden"
        ref={tabContainerRef}
      >
        <Tabs.Root defaultValue="account" value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List justify={'center'}>
            {mobileTabPanels.map(f => (
              <Tabs.Trigger key={f.title} value={f.title}>
                {f.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
      </div>
      {/* Ideally these components would mount/unmount in the main app space to avoid absolute positioning, however
        the map is kind of sensitive to mounting/unmounting in the current iteration.
        TODO: Make map less itchy about mounting/unmounting and have the amin "app space" on mobile have a better DOM structure
      */}
      {!!activePanel?.content && (
        <div
          className="absolute w-full left-0 z-[10000] bg-white overflow-y-auto p-4"
          style={{
            top: tabContainerBottom,
            height: `calc(100vh - ${tabContainerBottom}px)`,
          }}
        >
          {activePanel.content}
        </div>
      )}
    </>
  );
};
