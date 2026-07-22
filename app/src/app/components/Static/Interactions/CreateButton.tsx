'use client';
import {useMapStore} from '@/app/store/mapStore';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {routeManager} from '@/app/utils/map/mapUrlRoute';
import {MAP_TYPES} from '@constants/document/types';
import {MAP_ROUTES} from '@constants/document/routes';
import {Button} from '@radix-ui/themes';
import {PlusIcon} from '@radix-ui/react-icons';
import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';

/**
 * Creates a new map document from a DistrictrMap and routes to the editor.
 * Shared by CreateButton and PlaceMapGrid's cards.
 */
export const useCreateMapDocument = (view: Partial<DistrictrMap>, isCommunity?: boolean) => {
  const router = useRouter();
  const userID = useMapStore(stat => stat.userID);
  const setUserID = useMapStore(stat => stat.setUserID);
  const setNotification = useMapStore(stat => stat.setNotification);
  const [isCreating, setIsCreating] = useState(false);
  const shouldMakeCommunity = isCommunity ?? routeManager.mapUrlRoute === MAP_ROUTES.COI;

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  const createPlan = async () => {
    if (!view.districtr_map_slug || isCreating) return;
    setIsCreating(true);
    const r = await createMapDocument({
      districtr_map_slug: view.districtr_map_slug,
      map_type: shouldMakeCommunity ? MAP_TYPES.COMMUNITY : view.map_type,
    });
    if (r.ok) {
      router.push(
        `/${shouldMakeCommunity ? MAP_ROUTES.COI : MAP_ROUTES.DISTRICTS}/edit/${r.response.document_id}`
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

  return {createPlan, isCreating};
};

export const CreateButton: React.FC<{
  view: Partial<DistrictrMap>;
  extraClasses?: string;
  isCommunity?: boolean;
}> = ({view, extraClasses, isCommunity}) => {
  const {createPlan, isCreating} = useCreateMapDocument(view, isCommunity);

  return (
    <Button
      onClick={createPlan}
      loading={isCreating}
      className={`w-fit h-auto px-2 py-1 ${extraClasses}`}
      aria-label={`Create ${view.name} map`}
    >
      <PlusIcon />
      {view.name}
    </Button>
  );
};
