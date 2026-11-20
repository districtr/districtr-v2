'use client';
import React, {useEffect, useRef, useState} from 'react';
import {Button, DropdownMenu, Flex, Text, Tooltip} from '@radix-ui/themes';
import {CheckCircledIcon, CrossCircledIcon, QuestionMarkCircledIcon} from '@radix-ui/react-icons';
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

// Zoom targets that fit beside a verdict in the bar's place; more pieces than
// this collapse into a "+N" menu.
export const MAX_PIECE_TARGETS = 3;

/** Pieces (0 = largest) shown as their own targets, and those in the "+N"
 * menu: every piece when they fit, otherwise one fewer so the menu takes the
 * last slot. */
export const splitPieceTargets = (count: number, max = MAX_PIECE_TARGETS) => {
  const all = Array.from({length: count}, (_, i) => i);
  if (count <= max) return {shown: all, overflow: []};
  return {shown: all.slice(0, max - 1), overflow: all.slice(max - 1)};
};

const pieceName = (index: number) => (index === 0 ? 'Largest piece' : `Piece ${index + 1}`);
const unitCount = (n: number) => `${n} unit${n === 1 ? '' : 's'}`;

/** A piece's tooltip/menu text, with its size once the bboxes have loaded. */
export const pieceLabel = (index: number, nGeos?: number) =>
  nGeos === undefined ? pieceName(index) : `${pieceName(index)} · ${unitCount(nGeos)}`;

/** A piece target's accessible name. */
export const pieceAriaLabel = (index: number, district: string, nGeos?: number) =>
  `Zoom to ${pieceName(index).toLowerCase()} of district ${district}` +
  (nGeos === undefined ? '' : `, ${unitCount(nGeos)}`);

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

  // Zoom to one piece of a non-contiguous district (see ContiguityCell).
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

/** A row's verdict, in the bar's place: an icon and text, so it doesn't rest
 * on color alone. Grey with a question mark while unsaved edits make it stale,
 * dimmed while a post-save recheck is in flight. A non-contiguous district
 * follows with a zoom target per piece. */
export const ContiguityCell: React.FC<{
  zone: number;
  label: string;
  contiguity: DistrictContiguity;
}> = ({zone, label, contiguity: {components, isFetching, stale, zoomToPiece}}) => {
  const pieces = components?.[zone];
  const VerdictIcon = stale
    ? QuestionMarkCircledIcon
    : pieces === 1
      ? CheckCircledIcon
      : CrossCircledIcon;
  return (
    <Flex align="center" gap="2" style={{opacity: isFetching ? 0.5 : 1}}>
      {pieces === undefined ? (
        <Text size="2" color="gray">
          —
        </Text>
      ) : (
        <>
          <Text
            size="2"
            color={stale ? 'gray' : pieces === 1 ? 'green' : 'red'}
            style={{display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'}}
          >
            <VerdictIcon aria-hidden style={{flexShrink: 0}} />
            {/* Short to fit the bar's place; read as "not contiguous, 3 pieces". */}
            {pieces === 1 ? (
              'Contiguous'
            ) : (
              <span>
                <span className="sr-only">Not contiguous, </span>
                {pieces} pieces
              </span>
            )}
            {stale && <span className="sr-only">, as of the last save</span>}
          </Text>
          {pieces > 1 && (
            <PieceTargets zone={zone} label={label} count={pieces} zoomToPiece={zoomToPiece} />
          )}
        </>
      )}
    </Flex>
  );
};

/** One zoom target per piece, largest first, overflowing into a "+N" menu.
 * Sizes load on first hover or focus; a click before then fetches and zooms.
 * The last piece zoomed to stays marked until the next save renumbers them. */
const PieceTargets: React.FC<{
  zone: number;
  label: string;
  count: number;
  zoomToPiece: DistrictContiguity['zoomToPiece'];
}> = ({zone, label, count, zoomToPiece}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const [wantSizes, setWantSizes] = useState(false);
  const {data: features} = useQuery({
    ...piecesQuery(mapDocument, zone),
    enabled: wantSizes && !!mapDocument,
  });
  const nGeos = (index: number) => {
    const feature = features?.[index];
    return feature && 'properties' in feature
      ? (feature.properties?.n_geos as number | undefined)
      : undefined;
  };
  const [last, setLast] = useState<{savedAt?: string; index: number} | null>(null);
  const lastIndex = last && last.savedAt === mapDocument?.updated_at ? last.index : null;
  const zoom = (index: number) => {
    setLast({savedAt: mapDocument?.updated_at, index});
    zoomToPiece(zone, index);
  };
  const {shown, overflow} = splitPieceTargets(count);

  return (
    // Zoom only; clicks here (menu items too, through the portal) don't select
    // the row or switch the brush to this district.
    <Flex
      align="center"
      gap="1"
      flexShrink="0"
      onClick={e => e.stopPropagation()}
      onPointerEnter={() => setWantSizes(true)}
      onFocus={() => setWantSizes(true)}
    >
      {shown.map(index => (
        <Tooltip
          key={index}
          content={pieceLabel(index, nGeos(index))}
          delayDuration={HELP_TIP_HOVER_DELAY}
        >
          <Button
            size="1"
            variant={index === lastIndex ? 'solid' : 'outline'}
            aria-label={pieceAriaLabel(index, label, nGeos(index))}
            aria-current={index === lastIndex || undefined}
            onClick={() => zoom(index)}
            className="cursor-pointer"
          >
            {index + 1}
          </Button>
        </Tooltip>
      ))}
      {overflow.length > 0 && (
        <DropdownMenu.Root>
          <Tooltip content="More pieces" delayDuration={HELP_TIP_HOVER_DELAY}>
            <DropdownMenu.Trigger>
              <Button
                size="1"
                variant={lastIndex !== null && overflow.includes(lastIndex) ? 'solid' : 'outline'}
                aria-label={`${overflow.length} more pieces of district ${label}`}
                className="cursor-pointer"
              >
                +{overflow.length}
              </Button>
            </DropdownMenu.Trigger>
          </Tooltip>
          <DropdownMenu.Content size="1">
            {/* The radio mark shows the piece last zoomed to. */}
            <DropdownMenu.RadioGroup value={lastIndex === null ? '' : String(lastIndex)}>
              {overflow.map(index => (
                <DropdownMenu.RadioItem
                  key={index}
                  value={String(index)}
                  onSelect={() => zoom(index)}
                  aria-label={pieceAriaLabel(index, label, nGeos(index))}
                >
                  {pieceLabel(index, nGeos(index))}
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      )}
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
