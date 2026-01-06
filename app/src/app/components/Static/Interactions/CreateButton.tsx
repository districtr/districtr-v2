'use client';
import {useMapStore} from '@/app/store/mapStore';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {Button} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';
import {useEffect} from 'react';

export const CreateButton: React.FC<{view: Partial<DistrictrMap>; extraClasses?: string}> = ({
  view,
  extraClasses,
}) => {
  const router = useRouter();
  const userID = useMapStore(stat => stat.userID);
  const setUserID = useMapStore(stat => stat.setUserID);
  const setErrorNotification = useMapStore(stat => stat.setErrorNotification);

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  const handleCreatePlan = async () => {
    view.districtr_map_slug &&
      createMapDocument({
        districtr_map_slug: view.districtr_map_slug,
      }).then(r => {
        if (r.ok) {
          router.push(`/map/edit/${r.response.document_id}`);
        } else {
          setErrorNotification({
            message: r.error.detail,
            severity: 2,
          });
        }
      });
  };

  return (
    <Button onClick={handleCreatePlan} className={`w-fit h-auto px-2 py-1 ${extraClasses}`}>
      {view.name}
    </Button>
  );
};
