'use client';
import {useMapStore} from '@/app/store/mapStore';
import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {Button} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';
import {useEffect} from 'react';

export const CreateButton: React.FC<{view: Partial<DistrictrMap>}> = ({view}) => {
  const router = useRouter();
  const userID = useMapStore(stat => stat.userID);
  const setUserID = useMapStore(stat => stat.setUserID);

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  const handleCreatePlan = async () => {
    view.districtr_map_slug &&
      createMapDocument({
        districtr_map_slug: view.districtr_map_slug,
        user_id: userID,
      }).then(data => {
        console.log(data);
        // Use the row number for navigation with the new route pattern
        if (data.serial_id) {
          router.push(`/map/${data.serial_id}`);
        } else {
          // Fallback to the old method for backward compatibility
          router.push(`/map?document_id=${data.document_id}`);
        }
      });
  };

  return (
    <Button onClick={handleCreatePlan} className="w-min">
      {view.name}
    </Button>
  );
};
