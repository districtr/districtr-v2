'use client';

import {createMapDocument} from '@/app/utils/api/apiHandlers/createMapDocument';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {Button} from '@radix-ui/themes';
import {useRouter} from 'next/navigation';

export const CreateButton: React.FC<{view: DistrictrMap}> = ({view}) => {
  const router = useRouter();

  const handleCreatePlan = async () => {
    createMapDocument({
      districtr_map_slug: view.districtr_map_slug,
      user_id: null,
    }).then(data => {
      router.push(`/map?document_id=${data.document_id}`);
    });
  };

  return (
    <Button onClick={handleCreatePlan} className="w-min">
      {view.name}
    </Button>
  );
};
