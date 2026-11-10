'use client';
import React, {useEffect, useRef} from 'react';
import {Flex, IconButton, Text, Tooltip} from '@radix-ui/themes';
import {ZoomInIcon} from '@radix-ui/react-icons';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useMapStore} from '@store/mapStore';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {contiguityQueryKey, getContiguity} from '@utils/api/apiHandlers/getContiguity';
import {getZoneConnectedComponentBBoxes} from '@utils/api/apiHandlers/getZoneConnectedComponentBBoxes';
import {zoomToBounds} from '@utils/map/fitBounds';
import {ACCESS_STATES} from '@constants/document/state';
import {getFeatureBounds} from '../MapValidation/ZoomToFeature';
import {HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

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

  // Zoom to a non-contiguous district's stray pieces: the validation panel's
  // component bboxes arrive largest first, so repeat clicks cycle through
  // features[1..] and skip the main body.
  const queryClient = useQueryClient();
  const mapRef = useMapStore(state => state.getMapRef());
  const strayIndex = useRef<Record<number, number>>({});
  const cancelPendingFly = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPendingFly.current?.(), []);
  const zoomToStrayPiece = async (zone: number) => {
    if (!mapDocument || !mapRef) return;
    const features = await queryClient
      .fetchQuery({
        queryKey: ['TuningStrayPieces', mapDocument.document_id, mapDocument.updated_at, zone],
        queryFn: async () => {
          const result = await getZoneConnectedComponentBBoxes(mapDocument, zone);
          if (!result.ok) throw new Error(result.error.detail);
          return result.response.features;
        },
        staleTime: Infinity,
        retry: false,
      })
      .catch(() => undefined);
    if (!features || features.length < 2) return;
    const index = ((strayIndex.current[zone] ?? 0) % (features.length - 1)) + 1;
    strayIndex.current[zone] = index;
    const feature = features[index];
    const bounds = getFeatureBounds(feature);
    if (!bounds) return;
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
    zoomToStrayPiece,
  };
};

export type DistrictContiguity = ReturnType<typeof useDistrictContiguity>;

/** A row's verdict, in the bar's place: grey while unsaved edits make it
 * stale, dimmed while a post-save recheck is in flight. */
export const ContiguityCell: React.FC<{
  zone: number;
  label: string;
  contiguity: DistrictContiguity;
}> = ({zone, label, contiguity: {components, isFetching, stale, zoomToStrayPiece}}) => {
  const pieces = components?.[zone];
  return (
    <Flex align="center" gap="2" style={{opacity: isFetching ? 0.5 : 1}}>
      {pieces === undefined ? (
        <Text size="2" color="gray">
          —
        </Text>
      ) : (
        <>
          <Text size="2" color={stale ? 'gray' : pieces === 1 ? 'green' : 'red'}>
            {/* Short to fit the bar's place; read as "not contiguous, 3 pieces". */}
            {pieces === 1 ? (
              'Contiguous'
            ) : (
              <>
                <span className="sr-only">Not contiguous, </span>
                {pieces} pieces
              </>
            )}
            {stale && <span className="sr-only">, as of the last save</span>}
          </Text>
          {pieces > 1 && (
            <Tooltip
              content="Zoom to a piece other than the largest"
              delayDuration={HELP_TIP_HOVER_DELAY}
            >
              <IconButton
                variant="ghost"
                size="1"
                aria-label={`Zoom to a stray piece of district ${label}`}
                onClick={e => {
                  // Zoom only; don't switch the brush to this district.
                  e.stopPropagation();
                  zoomToStrayPiece(zone);
                }}
              >
                <ZoomInIcon />
              </IconButton>
            </Tooltip>
          )}
        </>
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
        Contiguity is from the last save. {/* The topbar cloud button's save. */}
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
