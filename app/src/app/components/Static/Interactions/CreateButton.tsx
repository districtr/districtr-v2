'use client';
import {useMapStore} from '@/app/store/mapStore';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {routeManager} from '@/app/utils/map/mapUrlRoute';
import {editPath} from '@/app/utils/map/editUrl';
import {MAP_TYPES} from '@constants/document/types';
import {MAP_ROUTES} from '@constants/document/routes';
import {Button} from '@radix-ui/themes';
import {PlusIcon} from '@radix-ui/react-icons';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import {setDraftSubmission} from '@/app/utils/draftSubmissions';
import {OverlayCard} from '@/app/components/Topbar/LoadingOverlay';

/**
 * Creates a new map document from a DistrictrMap and routes to the editor.
 * Shared by CreateButton and PlaceMapGrid's cards. Render `creatingOverlay`:
 * the session check, the create call and the editor's first load can take
 * several seconds, and the full-screen card both says so and blocks a second
 * click from creating another document. It matches the editor's own
 * "Loading map…" overlay, which takes over once the route changes.
 */
export const useCreateMapDocument = (
  view: Partial<DistrictrMap>,
  isCommunity?: boolean,
  portalId?: string | null,
  collectionMode?: string | null
) => {
  const router = useRouter();
  const userID = useMapStore(stat => stat.userID);
  const setUserID = useMapStore(stat => stat.setUserID);
  const setNotification = useMapStore(stat => stat.setNotification);
  const [isCreating, setIsCreating] = useState(false);
  const shouldMakeCommunity = isCommunity ?? routeManager.mapUrlRoute === MAP_ROUTES.COI;

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  // A page restored from the back/forward cache keeps its state: clear the
  // overlay so it doesn't cover the page the user came back to.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setIsCreating(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const createPlan = async () => {
    if (!view.districtr_map_slug || isCreating) return;
    setIsCreating(true);
    const r = await createMapDocument({
      districtr_map_slug: view.districtr_map_slug,
      map_type: shouldMakeCommunity ? MAP_TYPES.COMMUNITY : view.map_type,
      portal_id: portalId ?? undefined,
    });
    if (r.ok) {
      if (portalId && r.response.submission_id) {
        // Remember the finalize capability so flipping the map to
        // ready-to-share can offer submitting it to the portal.
        setDraftSubmission(r.response.document_id, {
          submissionId: r.response.submission_id,
          portalId,
          collectionMode,
        });
      }
      router.push(
        editPath(
          shouldMakeCommunity ? MAP_ROUTES.COI : MAP_ROUTES.DISTRICTS,
          r.response.document_id,
          r.response.public_id
        )
      );
    } else {
      setIsCreating(false);
      setNotification({
        // No status means the request never got an answer; its detail is just "{}".
        message: r.error.status
          ? `Couldn't create your map: ${r.error.detail}`
          : "Couldn't reach Districtr to create your map. Check your connection and try again.",
        importance: 2,
        type: 'error',
      });
    }
  };

  const creatingOverlay = isCreating ? <OverlayCard message="Creating your map…" /> : null;

  return {createPlan, isCreating, creatingOverlay};
};

export const CreateButton: React.FC<{
  view: Partial<DistrictrMap>;
  extraClasses?: string;
  isCommunity?: boolean;
  /** Portal slug: new maps get a draft submission for this portal. */
  portalId?: string | null;
  collectionMode?: string | null;
}> = ({view, extraClasses, isCommunity, portalId, collectionMode}) => {
  const {createPlan, isCreating, creatingOverlay} = useCreateMapDocument(
    view,
    isCommunity,
    portalId,
    collectionMode
  );

  return (
    <>
      <Button
        onClick={createPlan}
        loading={isCreating}
        className={`w-fit h-auto px-2 py-1 ${extraClasses}`}
        aria-label={`Create ${view.name} map`}
      >
        <PlusIcon />
        {view.name}
      </Button>
      {creatingOverlay}
    </>
  );
};
