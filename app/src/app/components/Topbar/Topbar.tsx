'use client';
import {Text, DropdownMenu, Flex, Heading, IconButton, Link, Tooltip, Tabs} from '@radix-ui/themes';
import React, {useRef} from 'react';
import {useMapStore} from '@store/mapStore';
import {ArrowLeftIcon, HamburgerMenuIcon} from '@radix-ui/react-icons';
import {DocumentMetadata} from '@utils/api/apiHandlers/types';
import {defaultPanels} from '@components/sidebar/DataPanelUtils';
import {PasswordPromptModal} from '../Toolbar/PasswordPromptModal';
import {UploaderModal} from '../Toolbar/UploaderModal';
import {MapHeader} from './MapHeader';
import {SavePopover} from './SavePopover';
import {SharePopoverAndModal} from './SharePopoverAndModal';
import {SettingsPopoverAndModal} from './SettingsPopoverAndModal';
import {saveMapDocumentMetadata} from '@/app/utils/api/apiHandlers/saveMapDocumentMetadata';
import {idb} from '@/app/utils/idb/idb';
import {RevertPopover} from './RevertPopover';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ANONYMOUS_DOCUMENT_ID} from '@/app/constants/document/limits';
import {ACCESS_STATES} from '@constants/document/state';
import {ViewSwitcher} from './ViewSwitcher';

export const Topbar: React.FC = () => {
  const handleReset = useMapStore(state => state.handleReset);
  const [modalOpen, setModalOpen] = React.useState<'upload' | null>(null);
  const mapDocument = useMapStore(state => state.mapDocument);
  const access = useMapStore(state => state.mapStatus?.access);
  // Read from mapControlsStore (set by the route/page) instead of inferring from
  // document_id. Public view documents have real UUIDs but should never expose
  // Save/Revert/etc. affordances.
  const isEditing = useMapControlsStore(state => state.isEditing);
  const isEval = useMapControlsStore(state => state.isEval);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const updateMetadata = useMapStore(state => state.updateMetadata);

  const handleMetadataChange = async (updates: Partial<DocumentMetadata>) => {
    if (!mapDocument?.document_id) return;
    const response = await saveMapDocumentMetadata({
      document_id: mapDocument?.document_id,
      metadata: updates,
    });
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
          <Flex align="center" gap="3">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="ml-2">
                <IconButton variant="ghost">
                  <HamburgerMenuIcon className="mr-2" />
                  <Heading size="3">Districtr</Heading>
                  {!mapDocument?.document_id && !isEval && (
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
                <DropdownMenu.Item>
                  <Link href="/places" color="gray">
                    New map
                  </Link>
                </DropdownMenu.Item>
                {!isEval && (
                  <DropdownMenu.Item onClick={() => setModalOpen('upload')}>
                    Upload block assignments
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger
                    disabled={
                      !mapDocument?.document_id || mapDocument.document_id === ANONYMOUS_DOCUMENT_ID
                    }
                  >
                    Export assignments
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.SubContent>
                    <DropdownMenu.Item>
                      <Tooltip content="Download a CSV of GEOIDs and zone IDs">
                        <a
                          href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?export_type=BlockAssignmentsCSV`}
                          download={`districtr-block-assignments-${mapDocument?.document_id}-${new Date().toDateString()}.csv`}
                        >
                          Unit assignments (CSV)
                        </a>
                      </Tooltip>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item>
                      <Tooltip content="Download a GeoJSON of dissolved district boundary polygons">
                        <a
                          href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?export_type=DistrictsGeoJSON`}
                          download={`districtr-districts-${mapDocument?.document_id}-${new Date().toDateString()}.geojson`}
                        >
                          District boundaries (GeoJSON)
                        </a>
                      </Tooltip>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item>
                      <Tooltip content="Download a zipped Shapefile of dissolved district boundary polygons">
                        <a
                          href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?export_type=DistrictsShapefile`}
                          download={`districtr-districts-${mapDocument?.document_id}-${new Date().toDateString()}.zip`}
                        >
                          District boundaries (Shapefile)
                        </a>
                      </Tooltip>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item>
                      <Tooltip content="Download a JSON of evaluation metrics for this map">
                        <a
                          href={`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument?.document_id}/export?export_type=EvaluationJSON`}
                          download={`districtr-evaluation-${mapDocument?.document_id}-${new Date().toDateString()}.json`}
                        >
                          Evaluation metrics (JSON)
                        </a>
                      </Tooltip>
                    </DropdownMenu.Item>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Sub>
                <DropdownMenu.Item>
                  <Link href="/my-maps" color="gray">
                    View recent maps
                  </Link>
                </DropdownMenu.Item>
                {!isEval && (
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger
                      disabled={!mapDocument?.document_id || access === ACCESS_STATES.READ}
                    >
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
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </Flex>
          {isEval ? (
            <Heading
              size="3"
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none"
            >
              Evaluation Report
            </Heading>
          ) : (
            <MapHeader handleMetadataChange={handleMetadataChange} />
          )}
          <Flex direction="row" align="center" gapX="3">
            <ViewSwitcher />
            {!isEval && (
              <>
                <SharePopoverAndModal handleMetadataChange={handleMetadataChange} />
                {isEditing && <SavePopover />}
                {isEditing && <RevertPopover />}
                <SettingsPopoverAndModal />
              </>
            )}
          </Flex>
        </Flex>
        <MobileDataTabs />
      </Flex>
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
