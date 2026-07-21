'use client';
import React, {useState} from 'react';
import {
  Dialog,
  Flex,
  Text,
  Heading,
  Separator,
  Spinner,
  Callout,
  IconButton,
} from '@radix-ui/themes';
import {InfoCircledIcon, Cross2Icon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {fastUniqBy} from '@/app/utils/arrays';
import type {Overlay} from '@/app/utils/api/apiHandlers/types';

/**
 * Provenance metadata published alongside overlay geojsons as
 * `overlay_metadata.json`, keyed by `{state}_{dataset}`. Fields vary by
 * source: census entries carry `vintage`; plan entries carry `plan_name`,
 * `year`, and `modified`.
 */
interface OverlayMetadataEntry {
  name: string;
  description: string;
  source: string;
  retrieved: string;
  vintage?: string;
  plan_name?: string;
  year?: string;
  modified?: string;
}

type OverlayMetadata = Record<string, OverlayMetadataEntry>;

// Counties are always available and are not stored as a DB overlay, so we
// render them from a static entry rather than the fetched metadata.
const COUNTY_ENTRY: OverlayMetadataEntry = {
  name: 'Counties',
  description: 'Show county boundaries and labels',
  source: 'Census FTP (TIGER/Line 2023)',
  vintage: '2023 TIGER/Line',
  retrieved: '',
};

/**
 * The metadata KEY for an overlay is the basename of its source URL minus the
 * `.geojson` extension (e.g. `.../overlays/al_cd.geojson` -> `al_cd`).
 */
const getOverlayKey = (source: string | null): string | null => {
  if (!source) return null;
  const basename = source.split('/').pop();
  if (!basename) return null;
  return basename.replace(/\.geojson$/, '');
};

// Enacted-plan datasets (from the source-URL suffix, e.g. `al_cd` -> "cd") are
// grouped under a "Enacted Districts" heading in the panel and this modal.
export const ENACTED_DATASETS = new Set(['cd', 'sldu', 'sldl', 'sld']);
export const datasetKey = (source: string | null) => getOverlayKey(source)?.split('_').pop() ?? '';
export const isLegislativeOverlay = (overlay: Overlay) =>
  ENACTED_DATASETS.has(datasetKey(overlay.source));

/**
 * Derive the base URL where `overlay_metadata.json` lives by stripping the
 * basename off any overlay's source URL.
 */
const getMetadataUrl = (source: string): string => {
  const base = source.slice(0, source.lastIndexOf('/'));
  return `${base}/overlay_metadata.json`;
};

const ProvenanceRow: React.FC<{label: string; value?: string}> = ({label, value}) => {
  if (!value) return null;
  return (
    <Flex gap="2" align="start">
      <Text size="1" color="gray" style={{minWidth: '110px'}}>
        {label}
      </Text>
      <Text size="1">{value}</Text>
    </Flex>
  );
};

const OverlaySection: React.FC<{entry: OverlayMetadataEntry}> = ({entry}) => (
  <Flex direction="column" gap="1">
    <Text size="2" weight="bold">
      {entry.name}
    </Text>
    {entry.description && (
      <Text size="1" color="gray">
        {entry.description}
      </Text>
    )}
    <Flex direction="column" gap="1" mt="1">
      <ProvenanceRow label="Source" value={entry.source} />
      <ProvenanceRow label="Vintage" value={entry.vintage} />
      <ProvenanceRow label="Plan" value={entry.plan_name} />
      <ProvenanceRow label="Election year" value={entry.year} />
      <ProvenanceRow label="Retrieved" value={entry.retrieved} />
      <ProvenanceRow label="Last modified" value={entry.modified} />
    </Flex>
  </Flex>
);

export const OverlayMetadataModal: React.FC = () => {
  const overlays = useMapStore(state => state.mapDocument?.overlays ?? []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [metadata, setMetadata] = useState<OverlayMetadata | null>(null);

  const handleOpenChange = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) return;
    const firstWithSource = overlays.find(o => o.source);
    if (!firstWithSource?.source) {
      // Nothing to fetch; the static county entry still renders.
      setMetadata({});
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(getMetadataUrl(firstWithSource.source));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: OverlayMetadata = await response.json();
      setMetadata(data);
    } catch {
      setError(true);
      setMetadata({});
    } finally {
      setLoading(false);
    }
  };

  const uniqueOverlays = fastUniqBy(overlays as Overlay[], 'name');
  const legislativeOverlays = uniqueOverlays.filter(isLegislativeOverlay);
  const otherOverlays = uniqueOverlays.filter(o => !isLegislativeOverlay(o));

  const entryFor = (overlay: Overlay): OverlayMetadataEntry => {
    const key = getOverlayKey(overlay.source);
    return (
      (key ? metadata?.[key] : undefined) ?? {
        name: overlay.name,
        description: overlay.description ?? '',
        source: '',
        retrieved: '',
      }
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>
        <IconButton
          variant="ghost"
          color="gray"
          size="1"
          className="cursor-pointer"
          title="About these boundaries"
          aria-label="About these boundaries"
        >
          <InfoCircledIcon />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Content className="max-w-[500px]">
        <Flex align="start" justify="between">
          <Dialog.Title className="m-0 flex-1">
            <Heading size="4">About these boundaries</Heading>
          </Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        {loading ? (
          <Flex align="center" justify="center" p="4">
            <Spinner />
          </Flex>
        ) : (
          // Header stays put; the boundary list scrolls within a capped height.
          <Flex direction="column" gap="3" mt="3" style={{maxHeight: '60vh', overflowY: 'auto'}}>
            {error && (
              <Callout.Root color="amber" size="1">
                <Callout.Icon>
                  <InfoCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  Detailed provenance is unavailable right now. Showing what we have.
                </Callout.Text>
              </Callout.Root>
            )}
            {legislativeOverlays.length > 0 && (
              <>
                <Text size="2" weight="bold">
                  Enacted Districts
                </Text>
                {legislativeOverlays.map(overlay => (
                  <OverlaySection key={overlay.overlay_id} entry={entryFor(overlay)} />
                ))}
                <Separator size="4" />
              </>
            )}
            <OverlaySection entry={COUNTY_ENTRY} />
            {otherOverlays.map(overlay => (
              <React.Fragment key={overlay.overlay_id}>
                <Separator size="4" />
                <OverlaySection entry={entryFor(overlay)} />
              </React.Fragment>
            ))}
          </Flex>
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default OverlayMetadataModal;
