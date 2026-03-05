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
  Spinner,
  Badge,
} from '@radix-ui/themes';
import React, {useEffect, useRef} from 'react';
import {useMapStore} from '@store/mapStore';
import {RecentMapsModal} from '@components/Toolbar/RecentMapsModal';
import {ArrowLeftIcon, HamburgerMenuIcon} from '@radix-ui/react-icons';
import {DistrictrMap, DocumentMetadata} from '@utils/api/apiHandlers/types';
import {defaultPanels} from '@components/sidebar/DataPanelUtils';
import {PasswordPromptModal} from '../Toolbar/PasswordPromptModal';
import {UploaderModal} from '../Toolbar/UploaderModal';
import {MapHeader} from './MapHeader';
import {useRouter} from 'next/navigation';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import {SavePopover} from './SavePopover';
import {SharePopoverAndModal} from './SharePopoverAndModal';
import {SettingsPopoverAndModal} from './SettingsPopoverAndModal';
import {saveMapDocumentMetadata} from '@/app/utils/api/apiHandlers/saveMapDocumentMetadata';
import {idb} from '@/app/utils/idb/idb';
import {RevertPopover} from './RevertPopover';
import {API_URL} from '@/app/utils/api/constants';

type ExportFormat = 'CSV' | 'GeoJSON';
type ExportType = 'ZoneAssignments' | 'BlockZoneAssignments' | 'Districts';
type ExportStatus = {
  label: string;
  phase: 'idle' | 'preparing' | 'downloading' | 'success' | 'error';
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  message?: string;
};

const bytesToLabel = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const parseFileNameFromDisposition = (contentDisposition: string | null) => {
  if (!contentDisposition) return null;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const fileNameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  return fileNameMatch?.[1] ?? null;
};

export const Topbar: React.FC = () => {
  const handleReset = useMapStore(state => state.handleReset);
  const [modalOpen, setModalOpen] = React.useState<'upload' | 'recents' | null>(null);
  const [exportStatus, setExportStatus] = React.useState<ExportStatus>({
    label: '',
    phase: 'idle',
  });
  const mapDocument = useMapStore(state => state.mapDocument);
  const isEditing = mapDocument?.document_id && mapDocument?.document_id !== 'anonymous';
  const access = useMapStore(state => state.mapStatus?.access);
  const mapViews = useMapStore(state => state.mapViews);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const data = mapViews?.data || [];
  const router = useRouter();
  const updateMetadata = useMapStore(state => state.updateMetadata);
  const isExporting = exportStatus.phase === 'preparing' || exportStatus.phase === 'downloading';

  useEffect(() => {
    if (exportStatus.phase === 'success' || exportStatus.phase === 'error') {
      const timeout = window.setTimeout(() => {
        setExportStatus(prev => ({...prev, phase: 'idle', message: undefined}));
      }, 5000);
      return () => window.clearTimeout(timeout);
    }
  }, [exportStatus.phase]);

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

  const handleSelectMap = (selectedMap: DistrictrMap) => {
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

  const handleExport = async ({
    label,
    format,
    exportType,
  }: {
    label: string;
    format: ExportFormat;
    exportType: ExportType;
  }) => {
    if (!mapDocument?.document_id || isExporting) return;

    const extension = format === 'CSV' ? 'csv' : 'geojson';
    const fallbackName = `districtr-${exportType}-${mapDocument.document_id}-${new Date()
      .toISOString()
      .slice(0, 10)}.${extension}`;
    const apiBaseUrl = API_URL || '';
    const exportUrl = `${apiBaseUrl}/api/document/${mapDocument.document_id}/export?format=${format}&export_type=${exportType}`;

    try {
      setExportStatus({
        label,
        phase: 'preparing',
        message: 'Preparing export on the server...',
      });

      const response = await fetch(exportUrl, {
        credentials: 'include',
      });
      if (!response.ok) {
        let detail = 'Failed to export assignments';
        try {
          const payload = await response.json();
          if (typeof payload?.detail === 'string') {
            detail = payload.detail;
          } else if (payload?.detail) {
            detail = JSON.stringify(payload.detail);
          }
        } catch {
          detail = `${detail} (HTTP ${response.status})`;
        }
        throw new Error(detail);
      }

      const totalBytesHeader = response.headers.get('content-length');
      const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : undefined;
      const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
      const filename =
        parseFileNameFromDisposition(response.headers.get('content-disposition')) ?? fallbackName;

      if (!response.body) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setExportStatus({
          label,
          phase: 'success',
          message: 'Export completed',
        });
        return;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let downloadedBytes = 0;
      setExportStatus({
        label,
        phase: 'downloading',
        progress: 0,
        downloadedBytes,
        totalBytes,
        message: 'Downloading export...',
      });
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        downloadedBytes += value.length;
        setExportStatus({
          label,
          phase: 'downloading',
          progress: totalBytes ? Math.min(100, (downloadedBytes / totalBytes) * 100) : undefined,
          downloadedBytes,
          totalBytes,
          message: 'Downloading export...',
        });
      }

      const blob = new Blob(chunks, {type: contentType});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus({
        label,
        phase: 'success',
        message: 'Export completed',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export assignments';
      setExportStatus({
        label,
        phase: 'error',
        message,
      });
      setErrorNotification({
        severity: 2,
        message,
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
                  <DropdownMenu.Item
                    disabled={isExporting}
                    onClick={() =>
                      handleExport({
                        label: 'VTD assignments (CSV)',
                        format: 'CSV',
                        exportType: 'ZoneAssignments',
                      })
                    }
                  >
                    <Tooltip content="Download a CSV of Census GEOIDs and zone IDs">
                      <Text>VTD assignments (CSV)</Text>
                    </Tooltip>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    disabled={isExporting}
                    onClick={() =>
                      handleExport({
                        label: 'VTD assignments (GeoJSON)',
                        format: 'GeoJSON',
                        exportType: 'ZoneAssignments',
                      })
                    }
                  >
                    <Tooltip content="Download a GeoJSON of Census GEOIDs and zone IDs">
                      <Text>VTD assignments (GeoJSON)</Text>
                    </Tooltip>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    disabled={!mapDocument?.child_layer || isExporting}
                    onClick={() =>
                      handleExport({
                        label: 'Block assignment (CSV)',
                        format: 'CSV',
                        exportType: 'BlockZoneAssignments',
                      })
                    }
                  >
                    <Tooltip content="Download a CSV of Census Block GEOIDs and zone IDs">
                      <Text>Block assignment (CSV)</Text>
                    </Tooltip>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    disabled={isExporting}
                    onClick={() =>
                      handleExport({
                        label: 'District boundaries (GeoJSON)',
                        format: 'GeoJSON',
                        exportType: 'Districts',
                      })
                    }
                  >
                    <Tooltip content="Download a GeoJSON of district boundaries">
                      <Text>District boundaries (GeoJSON)</Text>
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
            {exportStatus.phase !== 'idle' && (
              <Box className="hidden md:block border border-blue-200 bg-blue-50 px-3 py-1 rounded-md">
                <Flex align="center" gapX="2">
                  {(exportStatus.phase === 'preparing' || exportStatus.phase === 'downloading') && (
                    <Spinner size="1" />
                  )}
                  {(exportStatus.phase === 'success' || exportStatus.phase === 'error') && (
                    <Badge color={exportStatus.phase === 'success' ? 'green' : 'red'} variant="soft">
                      {exportStatus.phase.toUpperCase()}
                    </Badge>
                  )}
                  <Text size="1">
                    {exportStatus.label}
                    {exportStatus.phase === 'downloading' &&
                      exportStatus.downloadedBytes !== undefined &&
                      `: ${bytesToLabel(exportStatus.downloadedBytes)}`}
                    {exportStatus.phase === 'downloading' &&
                      exportStatus.totalBytes &&
                      ` / ${bytesToLabel(exportStatus.totalBytes)}`}
                    {exportStatus.phase === 'downloading' &&
                      exportStatus.progress !== undefined &&
                      ` (${Math.round(exportStatus.progress)}%)`}
                    {exportStatus.phase !== 'downloading' &&
                      exportStatus.message &&
                      `: ${exportStatus.message}`}
                  </Text>
                </Flex>
              </Box>
            )}
            <SharePopoverAndModal handleMetadataChange={handleMetadataChange} />
            {isEditing && <SavePopover />}
            {isEditing && <RevertPopover />}
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
