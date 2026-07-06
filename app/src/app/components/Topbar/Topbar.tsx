'use client';
import {Text, DropdownMenu, Flex, Heading, IconButton, Tabs} from '@radix-ui/themes';
import React, {useRef} from 'react';
import {useRouter} from 'next/navigation';
import {useMapStore} from '@store/mapStore';
import {ArrowLeftIcon, HamburgerMenuIcon} from '@radix-ui/react-icons';
import {DocumentMetadata} from '@utils/api/apiHandlers/types';
import {defaultPanels} from '@components/sidebar/DataPanelUtils';
import {PasswordPromptModal} from '../Toolbar/PasswordPromptModal';
import {UploaderModal} from '../Toolbar/UploaderModal';
import {MapHeader} from './MapHeader';
import {saveMapDocumentMetadata} from '@/app/utils/api/apiHandlers/saveMapDocumentMetadata';
import {idb} from '@/app/utils/idb/idb';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ModeSwitcher} from './ModeSwitcher';
import {MapActionsDropdown} from './MapActionsDropdown';
import {useAutoSave} from '@/app/hooks/useAutoSave';

export const Topbar: React.FC = () => {
  const router = useRouter();
  useAutoSave();
  const [modalOpen, setModalOpen] = React.useState<'upload' | null>(null);
  const mapDocument = useMapStore(state => state.mapDocument);
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
                {/* onSelect (not an <a>) so the whole item is clickable: Radix Themes'
                    Item swallows a child anchor's click, and asChild throws. */}
                <DropdownMenu.Item className="cursor-pointer" onSelect={() => router.push('/')}>
                  Home
                </DropdownMenu.Item>
                <DropdownMenu.Item className="cursor-pointer" onSelect={() => router.push('/draw')}>
                  Main Map
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="cursor-pointer"
                  onSelect={() => router.push('/catalog')}
                >
                  Catalog
                </DropdownMenu.Item>
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
            <ModeSwitcher />
            {!isEval && <MapActionsDropdown handleMetadataChange={handleMetadataChange} />}
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
