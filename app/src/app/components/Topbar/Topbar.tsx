'use client';
import {
  Button,
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
import React, {useEffect, useRef} from 'react';
import {useMapStore} from '@store/mapStore';
import {RecentMapsModal} from '@components/Toolbar/RecentMapsModal';
import {ToolSettings} from '@components/Toolbar/Settings';
import {
  ArrowLeftIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  FileIcon,
  GearIcon,
  HamburgerMenuIcon,
  SymbolIcon,
} from '@radix-ui/react-icons';
import {useTemporalStore} from '@store/temporalStore';
import {DistrictrMap} from '@utils/api/apiHandlers/types';
import {defaultPanels} from '@components/sidebar/DataPanelUtils';
import {PasswordPromptModal} from '../Toolbar/PasswordPromptModal';
import {UploaderModal} from '../Toolbar/UploaderModal';
import {MapHeader} from './MapHeader';
import {EditStatus} from './EditStatus';
import {SaveShareModal} from '../Toolbar/SaveShareModal/SaveShareModal';
import {useRouter} from 'next/navigation';
import {idb} from '@/app/utils/idb/idb';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';

export const Topbar: React.FC = () => {
  const handleReset = useMapStore(state => state.handleReset);
  const [modalOpen, setModalOpen] = React.useState<'upload' | 'recents' | 'save-share' | null>(
    null
  );
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);
  const access = useMapStore(state => state.mapStatus?.access);
  const userID = useMapStore(state => state.userID);
  const mapViews = useMapStore(state => state.mapViews);
  const showRecentMaps = useMapStore(state => state.userMaps.length > 0);
  const clear = useTemporalStore(store => store.clear);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const data = mapViews?.data || [];
  const router = useRouter();
  const documentFromIdb = useIdbDocument(mapDocument?.document_id);
  const handlePutAssignments = useAssignmentsStore(state => state.handlePutAssignments);
  const handleSelectMap = (selectedMap: DistrictrMap) => {
    clear();
    createMapDocument({
      districtr_map_slug: selectedMap.districtr_map_slug,
    }).then(r => {
      if (r.ok) {
        router.push(`/map/edit/${r.response.document_id}`);
      } else {
        setErrorNotification({
          severity: 2,
          id: 'map-failed-to-create',
          message: r.error.detail,
        });
      }
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
              <DropdownMenu.Item>
                <Link href="/" color="gray">
                  Home
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Sub>
                <Tooltip open={!mapDocument?.document_id} content="Start by selecting a geography">
                  <DropdownMenu.SubTrigger>Create new map</DropdownMenu.SubTrigger>
                </Tooltip>
                <DropdownMenu.SubContent>
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>Select a geography</DropdownMenu.SubTrigger>
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
                  <DropdownMenu.Item onClick={() => setModalOpen('upload')}>
                    Upload block assignments
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger disabled={!mapDocument?.document_id}>
                  Export assignments
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent>
                  <DropdownMenu.Item>
                    <Tooltip content="Download a CSV of Census GEOIDs and zone IDs">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?format=CSV&export_type=ZoneAssignments`}
                        download={`districtr-block-assignments-${mapDocument?.document_id}-${new Date().toDateString()}.csv`}
                      >
                        VTD assignments (CSV)
                      </a>
                    </Tooltip>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item>
                    <Tooltip content="Download a GeoJSON of Census GEOIDs and zone IDs">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?format=GeoJSON&export_type=ZoneAssignments`}
                        download={`districtr-block-assignments-${mapDocument?.document_id}-${new Date().toDateString()}.csv`}
                      >
                        VTD assignments (GeoJSON)
                      </a>
                    </Tooltip>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item disabled={!mapDocument?.child_layer}>
                    <Tooltip content="Download a CSV of Census Block GEOIDs and zone IDs">
                      <a
                        href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?format=CSV&export_type=BlockZoneAssignments`}
                        download={`districtr-block-assignments-${mapDocument?.document_id}-${new Date().toDateString()}.csv`}
                      >
                        Block assignment (CSV)
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
              <DropdownMenu.Item onClick={() => setModalOpen('recents')} disabled={!showRecentMaps}>
                View recent maps
              </DropdownMenu.Item>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger disabled={!mapDocument?.document_id || access === 'read'}>
                  Reset map
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent>
                  <Text size="2" className="w-[50vw] max-w-60 p-3">
                    Are you sure? This will reset all zone assignments and broken geographies.{' '}
                    <b>Resetting your map cannot be undone.</b>
                  </Text>
                  <DropdownMenu.Item onClick={handleReset} color="red">
                    Reset map
                  </DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <MapHeader />
          <Flex direction="row" align="center" gapX="3">
            <Text size="1" className="italic">
              Last saved:{' '}
              {new Date(documentFromIdb?.document_metadata.updated_at ?? '').toLocaleString()}
            </Text>
            {documentFromIdb?.clientLastUpdated !==
            documentFromIdb?.document_metadata.updated_at ? (
              <IconButton variant="ghost" size="1" color="amber" onClick={() => handlePutAssignments()}>
                <Flex direction="row" align="center" gapX="1">
                  <SymbolIcon className="size-4" />
                  <Text size="1" className="italic">
                    Updates not yet synced
                  </Text>
                </Flex>
              </IconButton>
            ) : (
              <CheckIcon className="size-4" color="green" />
            )}
            {/* <EditStatus /> */}
            {/* <Button
              variant="outline"
              disabled={!mapDocument?.document_id}
              onClick={() => setModalOpen('save-share')}
              size="1"
            >
              Save and Share
            </Button> */}
            <IconButton
              variant={settingsOpen ? 'solid' : 'outline'}
              size="1"
              onClick={() => setSettingsOpen(prev => !prev)}
            >
              <GearIcon className="size-full p-1" />
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
      <SaveShareModal open={modalOpen === 'save-share'} onClose={() => setModalOpen(null)} />
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
