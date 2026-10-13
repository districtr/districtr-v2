'use client';
import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {ACCESS_STATES} from '@constants/document/state';

/**
 * The unassigned-area search, shared so every reader lands on one cache entry —
 * the key and its document-id convention have to match exactly or a second
 * reader silently gets nothing.
 *
 * Keyed on document_id + updated_at (same pattern as Contiguity): it refetches
 * whenever a save lands, regardless of whether a given reader stayed mounted
 * the whole time.
 *
 * `observeOnly` readers (the validity section's one-line preview) subscribe to
 * the result without starting the search themselves; the panel that lists the
 * areas is what triggers it.
 */
export const useUnassignedFeatures = ({observeOnly = false}: {observeOnly?: boolean} = {}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const shatterIds = useAssignmentsStore(state => state.shatterIds);

  // Read access resolves to the public_id (same convention as the rest of the
  // app's read-only sharing); edit access uses the document_id directly.
  const documentIdParam =
    mapDocument?.access === ACCESS_STATES.READ && mapDocument?.public_id
      ? String(mapDocument.public_id)
      : mapDocument?.document_id;

  const {data, isLoading} = useQuery({
    queryKey: ['UnassignedFeatures', documentIdParam, mapDocument?.updated_at],
    queryFn: () =>
      GeometryWorker!.getUnassignedGeometries(documentIdParam, Array.from(shatterIds.parents)),
    enabled: !observeOnly && !!documentIdParam && !!GeometryWorker,
    staleTime: 0,
    retry: false,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });

  return {
    features: data?.dissolved?.features || [],
    isLoading,
    // Not `!isLoading`: an observe-only query never enters a loading state, so
    // a result's existence is what says the search has actually run.
    hasResult: data !== undefined,
  };
};
