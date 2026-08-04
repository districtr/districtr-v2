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
import {CreatePlanCountyDialog} from './CreatePlanCountyDialog';

/** Whether county-scoped creation is offered: it needs the state FIPS to
 * list counties, and community maps don't support the filter. */
export const canFilterByCounty = (view: Partial<DistrictrMap>, isCommunity: boolean) =>
  !isCommunity && !!view.statefps?.length;

/**
 * Creates a new map document from a DistrictrMap and routes to the editor.
 * Shared by CreateButton, PlaceMapGrid's cards, and CountyPlanMenu. The view
 * is passed per call so one hook instance can create plans for any view.
 */
export const useCreateMapDocument = (isCommunity?: boolean) => {
  const router = useRouter();
  const userID = useMapStore(stat => stat.userID);
  const setUserID = useMapStore(stat => stat.setUserID);
  const setNotification = useMapStore(stat => stat.setNotification);
  const [isCreating, setIsCreating] = useState(false);
  const shouldMakeCommunity = isCommunity ?? routeManager.mapUrlRoute === MAP_ROUTES.COI;

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  const createPlan = async (view: Partial<DistrictrMap>, countyFilter?: string[]) => {
    if (!view.districtr_map_slug || isCreating) return;
    setIsCreating(true);
    const r = await createMapDocument({
      districtr_map_slug: view.districtr_map_slug,
      map_type: shouldMakeCommunity ? MAP_TYPES.COMMUNITY : view.map_type,
      county_filter: countyFilter?.length ? countyFilter : undefined,
    });
    if (r.ok) {
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
        message: r.error.detail,
        importance: 2,
        type: 'error',
      });
    }
  };

  return {createPlan, isCreating, shouldMakeCommunity};
};

export const CreateButton: React.FC<{
  view: Partial<DistrictrMap>;
  extraClasses?: string;
  isCommunity?: boolean;
}> = ({view, extraClasses, isCommunity}) => {
  const {createPlan, isCreating, shouldMakeCommunity} = useCreateMapDocument(isCommunity);
  const [dialogOpen, setDialogOpen] = useState(false);
  const offerCounties = canFilterByCounty(view, shouldMakeCommunity);

  return (
    <>
      <Button
        onClick={() => (offerCounties ? setDialogOpen(true) : createPlan(view))}
        loading={isCreating}
        className={`w-fit h-auto px-2 py-1 ${extraClasses}`}
        aria-label={`Create ${view.name} map`}
      >
        <PlusIcon />
        {view.name}
      </Button>
      {offerCounties && (
        <CreatePlanCountyDialog
          view={view}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          createPlan={countyFilter => createPlan(view, countyFilter)}
          isCreating={isCreating}
        />
      )}
    </>
  );
};
