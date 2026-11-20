'use client';
import React, {useEffect, useRef, useState} from 'react';
import {Button, DropdownMenu, Flex, Text, Tooltip} from '@radix-ui/themes';
import {
  CheckCircledIcon,
  ChevronDownIcon,
  CrossCircledIcon,
  QuestionMarkCircledIcon,
} from '@radix-ui/react-icons';
import {queryOptions, useQuery, useQueryClient} from '@tanstack/react-query';
import {useMapStore} from '@store/mapStore';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {contiguityQueryKey, getContiguity} from '@utils/api/apiHandlers/getContiguity';
import {getZoneConnectedComponentBBoxes} from '@utils/api/apiHandlers/getZoneConnectedComponentBBoxes';
import type {DocumentObject} from '@utils/api/apiHandlers/types';
import {zoomToBounds} from '@utils/map/fitBounds';
import {ACCESS_STATES} from '@constants/document/state';
import {getFeatureBounds} from '../MapValidation/ZoomToFeature';
import {HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

const pieceName = (index: number) => (index === 0 ? 'Largest piece' : `Piece ${index + 1}`);

/** A piece's menu text, with its size once the bboxes have loaded. */
export const pieceLabel = (index: number, nGeos?: number) =>
  nGeos === undefined
    ? pieceName(index)
    : `${pieceName(index)} · ${nGeos} unit${nGeos === 1 ? '' : 's'}`;

// One district's connected-component bboxes, largest first. Keyed by save like
// the contiguity check, so the pieces match the verdict's count.
const piecesQuery = (mapDocument: DocumentObject | null, zone: number) =>
  queryOptions({
    queryKey: ['TuningPieces', mapDocument?.document_id, mapDocument?.updated_at, zone],
    queryFn: async () => {
      if (!mapDocument) throw new Error('No document');
      const result = await getZoneConnectedComponentBBoxes(mapDocument, zone);
      if (!result.ok) throw new Error(result.error.detail);
      return result.response.features;
    },
    staleTime: Infinity,
    retry: false,
  });

/**
 * Contiguity for Super Draw's tuning view of the population meters: once every
 * district is within a few hundred people of ideal the bars all look
 * identical, so the tuning view swaps each bar for this district's contiguity
 * verdict and keeps the rest of the row as it is.
 *
 * Contiguity shares one cache entry (contiguityQueryKey) with the validation
 * panel and the draft-status helper. The key turns over with the document's
 * updated_at, so the check runs once per save; between saves the verdicts are
 * marked stale rather than refetched.
 */
export const useDistrictContiguity = (enabled: boolean) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const {data: contiguity, isFetching} = useQuery({
    queryKey: contiguityQueryKey(mapDocument),
    queryFn: () => getContiguity(mapDocument),
    // The endpoint resolves by public_id. staleTime Infinity (as in
    // useDraftStatusCriteria): the key already encodes freshness, so toggling
    // the view back on must not re-hit the endpoint.
    enabled: enabled && !!mapDocument?.public_id,
    staleTime: Infinity,
    retry: false,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });
  const components = contiguity?.ok ? contiguity.response : undefined;
  // Population updates as you paint, contiguity only on save. Editors only:
  // a viewer's map can't be out of date with itself.
  const {isOutdated, save} = useMapSaveStatus();
  const isReadOnly = useMapStore(state => state.mapStatus?.access) === ACCESS_STATES.READ;
  const stale = isOutdated && !isReadOnly;

  // Zoom to one piece of a non-contiguous district (see PieceMenu).
  const queryClient = useQueryClient();
  const mapRef = useMapStore(state => state.getMapRef());
  const cancelPendingFly = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPendingFly.current?.(), []);
  const zoomToPiece = async (zone: number, index: number) => {
    if (!mapDocument || !mapRef) return;
    const features = await queryClient
      .fetchQuery(piecesQuery(mapDocument, zone))
      .catch(() => undefined);
    const feature = features?.[index];
    const bounds = feature && getFeatureBounds(feature);
    if (!feature || !bounds) return;
    const geoIds = 'properties' in feature ? feature.properties?.geo_ids : undefined;
    cancelPendingFly.current?.();
    cancelPendingFly.current = zoomToBounds(mapRef, mapDocument, {bounds, geoIds});
  };

  return {
    components,
    isFetching,
    stale,
    save,
    error: contiguity?.ok === false ? contiguity.error.detail : null,
    zoomToPiece,
  };
};

export type DistrictContiguity = ReturnType<typeof useDistrictContiguity>;

// The verdict's text gives way first when the sidebar is narrow; its icon and
// color still carry it.
const TRUNCATE: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/** A row's verdict, in the bar's place: an icon and text, so it doesn't rest
 * on color alone. Grey with a question mark while unsaved edits make it stale,
 * dimmed while a post-save recheck is in flight. A non-contiguous district's
 * verdict opens the list of its pieces. */
export const ContiguityCell: React.FC<{
  zone: number;
  label: string;
  contiguity: DistrictContiguity;
}> = ({zone, label, contiguity: {components, isFetching, stale, zoomToPiece}}) => {
  const pieces = components?.[zone];
  return (
    // Clipped, not spilled: the cell is as narrow as the bar it replaces.
    <Flex
      align="center"
      gap="2"
      minWidth="0"
      style={{opacity: isFetching ? 0.5 : 1, overflowX: 'clip'}}
    >
      {pieces === undefined ? (
        <Text size="2" color="gray">
          —
        </Text>
      ) : pieces === 1 ? (
        <Text
          size="2"
          color={stale ? 'gray' : 'green'}
          style={{display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0}}
        >
          {stale ? (
            <QuestionMarkCircledIcon aria-hidden style={{flexShrink: 0}} />
          ) : (
            <CheckCircledIcon aria-hidden style={{flexShrink: 0}} />
          )}
          <span style={TRUNCATE}>Contiguous</span>
          {stale && <span className="sr-only">, as of the last save</span>}
        </Text>
      ) : (
        <PieceMenu
          zone={zone}
          label={label}
          count={pieces}
          stale={stale}
          zoomToPiece={zoomToPiece}
        />
      )}
    </Flex>
  );
};

/** A non-contiguous district's verdict, and the way to its pieces: a menu of
 * zoom targets, largest first, with sizes once they load. One trigger fits the
 * bar's place at any sidebar width, where a button per piece would not. The
 * menu stays open after a pick so the pieces can be stepped through; its mark
 * shows the last one zoomed to, until the next save renumbers them. */
const PieceMenu: React.FC<{
  zone: number;
  label: string;
  count: number;
  stale: boolean;
  zoomToPiece: DistrictContiguity['zoomToPiece'];
}> = ({zone, label, count, stale, zoomToPiece}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const [open, setOpen] = useState(false);
  const {data: features} = useQuery({
    ...piecesQuery(mapDocument, zone),
    enabled: open && !!mapDocument,
  });
  const nGeos = (index: number) => {
    const feature = features?.[index];
    return feature && 'properties' in feature
      ? (feature.properties?.n_geos as number | undefined)
      : undefined;
  };
  const [last, setLast] = useState<{savedAt?: string; index: number} | null>(null);
  const lastIndex = last && last.savedAt === mapDocument?.updated_at ? last.index : null;

  return (
    // Zoom only; clicks here (menu items too, through the portal) don't select
    // the row or switch the brush to this district.
    <Flex minWidth="0" onClick={e => e.stopPropagation()}>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <Tooltip content="Show this district's pieces" delayDuration={HELP_TIP_HOVER_DELAY}>
          <DropdownMenu.Trigger>
            <Button
              size="2"
              variant="ghost"
              color={stale ? 'gray' : 'red'}
              className="cursor-pointer"
              style={{minWidth: 0, gap: 4}}
            >
              {stale ? (
                <QuestionMarkCircledIcon aria-hidden style={{flexShrink: 0}} />
              ) : (
                <CrossCircledIcon aria-hidden style={{flexShrink: 0}} />
              )}
              {/* Short to fit the bar's place; read as "not contiguous, 3 pieces". */}
              <span style={TRUNCATE}>
                <span className="sr-only">Not contiguous, </span>
                {count} pieces
                {stale && <span className="sr-only">, as of the last save</span>}
              </span>
              <ChevronDownIcon aria-hidden style={{flexShrink: 0}} />
            </Button>
          </DropdownMenu.Trigger>
        </Tooltip>
        <DropdownMenu.Content size="1">
          <DropdownMenu.Label>Zoom to a piece of district {label}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={lastIndex === null ? '' : String(lastIndex)}>
            {Array.from({length: count}, (_, index) => (
              <DropdownMenu.RadioItem
                key={index}
                value={String(index)}
                onSelect={e => {
                  // Keep the menu open, to go on to the next piece.
                  e.preventDefault();
                  setLast({savedAt: mapDocument?.updated_at, index});
                  zoomToPiece(zone, index);
                }}
              >
                {pieceLabel(index, nGeos(index))}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Flex>
  );
};

/** Under the rows: why the verdicts are stale, or why there are none. */
export const ContiguityNotes: React.FC<{contiguity: DistrictContiguity}> = ({
  contiguity: {stale, save, error},
}) => (
  <>
    {stale && (
      <Text size="1" color="gray" mx="2" mt="1">
        Contiguity is from the last save; newer edits aren&apos;t checked yet.{' '}
        {/* The topbar cloud button's save. */}
        <button
          type="button"
          onClick={() => save(false, {silent: true})}
          className="inline cursor-pointer font-semibold text-districtrBlue hover:underline underline-offset-2"
        >
          Save now
        </button>
      </Text>
    )}
    {/* Otherwise a failed check reads like a row of unstarted districts. */}
    {error && (
      <Text size="1" color="red" mx="2" mt="1">
        Contiguity unavailable: {error}
      </Text>
    )}
  </>
);
