'use client';
import React, {useState} from 'react';
import {Button, Dialog, DropdownMenu, Text, Tooltip} from '@radix-ui/themes';
import {CaretDownIcon, MixIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {ANONYMOUS_DOCUMENT_ID} from '@/app/constants/document/limits';
import {ACCESS_STATES} from '@constants/document/state';
import {DocumentMetadata} from '@utils/api/apiHandlers/types';
import {SaveShareModal} from '../Toolbar/SaveShareModal/SaveShareModal';
import {ToolSettings} from '../Toolbar/Settings';

/** Consolidated "Map actions" menu for the editor topbar: share, export,
 * settings, and reset in one dropdown. Saving lives in the topbar
 * SaveButton. */
export const MapActionsDropdown: React.FC<{
  handleMetadataChange: (updates: Partial<DocumentMetadata>) => Promise<void>;
}> = ({handleMetadataChange}) => {
  const [modal, setModal] = useState<'share' | 'settings' | null>(null);
  const mapDocument = useMapStore(state => state.mapDocument);
  const access = useMapStore(state => state.mapStatus?.access);
  const handleReset = useMapStore(state => state.handleReset);

  // Defer past the dropdown's close so Radix doesn't leave pointer-events:none
  // stuck on the body when a dialog opens from onSelect.
  const openModal = (which: 'share' | 'settings') => setTimeout(() => setModal(which), 0);

  // Export works for view-only users too: the backend resolves a public_id the same
  // as a document UUID, so fall back to the public_id when the loaded doc is the
  // anonymous read-only copy.
  const exportId =
    mapDocument?.document_id && mapDocument.document_id !== ANONYMOUS_DOCUMENT_ID
      ? mapDocument.document_id
      : mapDocument?.public_id;

  const downloadExport = (exportType: string) => {
    if (!exportId) return;
    // Trigger via a transient anchor — a DropdownMenu.Item swallows a child anchor's
    // click. The download filename comes from the backend's Content-Disposition.
    const a = document.createElement('a');
    a.href = `${process.env.NEXT_PUBLIC_API_URL}/api/document/${exportId}/export?export_type=${exportType}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button
            variant="surface"
            color="gray"
            size="2"
            className="cursor-pointer relative transition-shadow hover:shadow-md"
            data-testid="map-actions-trigger"
          >
            <MixIcon />
            {/* Icon-only on phones to keep the topbar to one row. */}
            <span className="hidden md:inline">Map actions</span>
            <CaretDownIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          sideOffset={6}
          className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          <DropdownMenu.Item
            className="cursor-pointer"
            disabled={!mapDocument?.document_id}
            data-testid="share-button"
            onSelect={() => openModal('share')}
          >
            Share map
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger disabled={!exportId}>
              Export assignments
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent>
              <DropdownMenu.Item
                className="cursor-pointer"
                onSelect={() => downloadExport('BlockAssignmentsCSV')}
              >
                <Tooltip content="Download a CSV of GEOIDs and zone IDs">
                  <span>Unit assignments (CSV)</span>
                </Tooltip>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="cursor-pointer"
                onSelect={() => downloadExport('DistrictsGeoJSON')}
              >
                <Tooltip content="Download a GeoJSON of dissolved district boundary polygons">
                  <span>District boundaries (GeoJSON)</span>
                </Tooltip>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="cursor-pointer"
                onSelect={() => downloadExport('DistrictsShapefile')}
              >
                <Tooltip content="Download a zipped Shapefile of dissolved district boundary polygons">
                  <span>District boundaries (Shapefile)</span>
                </Tooltip>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="cursor-pointer"
                onSelect={() => downloadExport('EvaluationJSON')}
              >
                <Tooltip content="Download a JSON of evaluation metrics for this map">
                  <span>Evaluation metrics (JSON)</span>
                </Tooltip>
              </DropdownMenu.Item>
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator />
          {/* Below lg the sidebar (and its Visual settings popover) is hidden,
              so the settings need an entry point here. Desktop uses the sidebar. */}
          <DropdownMenu.Item
            className="cursor-pointer lg:hidden"
            disabled={!mapDocument?.document_id}
            onSelect={() => openModal('settings')}
          >
            Visual settings
          </DropdownMenu.Item>
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
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <SaveShareModal
        open={modal === 'share'}
        onClose={() => setModal(null)}
        handleMetadataChange={handleMetadataChange}
      />
      <Dialog.Root open={modal === 'settings'} onOpenChange={open => !open && setModal(null)}>
        <Dialog.Content style={{maxWidth: 360}} className="max-h-[80vh] overflow-y-auto">
          <Dialog.Title>Visual settings</Dialog.Title>
          <ToolSettings />
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
};
