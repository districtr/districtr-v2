'use client';
import {useMapStore} from '@/app/store/mapStore';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {routeManager} from '@/app/utils/map/mapUrlRoute';
import {MAP_TYPES} from '@constants/document/types';
import {MAP_ROUTES} from '@constants/document/routes';
import {Button} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';
import {useEffect} from 'react';

export const CreateButton: React.FC<{
  view: Partial<DistrictrMap>;
  extraClasses?: string;
  isCommunity?: boolean;
}> = ({view, extraClasses, isCommunity}) => {
  const router = useRouter();
  const userID = useMapStore(stat => stat.userID);
  const setUserID = useMapStore(stat => stat.setUserID);
  const setErrorNotification = useMapStore(stat => stat.setErrorNotification);
  const shouldMakeCommunity = isCommunity ?? routeManager.mapUrlRoute === MAP_ROUTES.COI;

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  const handleCreatePlan = async () => {
    view.districtr_map_slug &&
      createMapDocument({
        districtr_map_slug: view.districtr_map_slug,
        map_type: shouldMakeCommunity ? MAP_TYPES.COMMUNITY : view.map_type,
      }).then(r => {
        if (r.ok) {
          router.push(
            `/${shouldMakeCommunity ? MAP_ROUTES.COI : MAP_ROUTES.DISTRICTS}/edit/${r.response.document_id}`
          );
        } else {
          setErrorNotification({
            message: r.error.detail,
            severity: 2,
          });
        }
      });
  };

  return (
    <Button
      onClick={handleCreatePlan}
      className={`w-fit h-auto px-2 py-1 ${extraClasses}`}
      aria-label={`Create ${view.name} map`}
    >
      {view.name}
    </Button>
  );
};
