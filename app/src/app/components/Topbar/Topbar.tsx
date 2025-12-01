'use client';
import {
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
import {
  ArrowLeftIcon,
  HamburgerMenuIcon,
} from '@radix-ui/react-icons';
import {useTemporalStore} from '@store/temporalStore';
import {DistrictrMap, DocumentMetadata} from '@utils/api/apiHandlers/types';
import {defaultPanels} from '@components/sidebar/DataPanelUtils';
import {PasswordPromptModal} from '../Toolbar/PasswordPromptModal';
import {UploaderModal} from '../Toolbar/UploaderModal';
import {MapHeader} from './MapHeader';
import {useRouter} from 'next/navigation';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import { SavePopover } from './SavePopover';
import { SharePopoverAndModal } from './SharePopoverAndModal';
import { SettingsPopoverAndModal } from './SettingsPopoverAndModal';
import { saveMapDocumentMetadata } from '@/app/utils/api/apiHandlers/saveMapDocumentMetadata';
import { idb } from '@/app/utils/idb/idb';

export const Topbar: React.FC = () => {
  const handleReset = useMapStore(state => state.handleReset);
  const [modalOpen, setModalOpen] = React.useState<'upload' | 'recents' | 'save-share' | null>(
    null
  );
  const mapDocument = useMapStore(state => state.mapDocument);
  const isEditing = mapDocument?.document_id && mapDocument?.document_id !== 'anonymous';
  const access = useMapStore(state => state.mapStatus?.access);
  const mapViews = useMapStore(state => state.mapViews);
  const clear = useTemporalStore(store => store.clear);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const data = mapViews?.data || [];
  const router = useRouter();
  const updateMetadata = useMapStore(state => state.updateMetadata);


  const handleMetadataChange = async (updates: Partial<DocumentMetadata>) => {
    if (!mapDocument?.document_id) return;
    const response = await saveMapDocumentMetadata({
      document_id: mapDocument?.document_id,
      metadata: updates,
    })
    if (response.ok) {
      idb.updateIdbMetadata(mapDocument?.document_id, updates);
      updateMetadata(updates);
    } else {
      setErrorNotification({
        message: 'Failed to save metadata',
        severity: 2,
      });
    }
  };

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
              <DropdownMenu.Item onClick={() => setModalOpen('recents')} disabled={false}>
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
          <MapHeader handleMetadataChange={handleMetadataChange} />
          <Flex direction="row" align="center" gapX="3">
            <SharePopoverAndModal handleMetadataChange={handleMetadataChange} />
            {isEditing && <SavePopover  />}
            <SettingsPopoverAndModal />
          </Flex>
        </Flex>
        <MobileDataTabs />
      </Flex>
      <RecentMapsModal open={modalOpen === 'recents'} onClose={() => setModalOpen(null)} />
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
