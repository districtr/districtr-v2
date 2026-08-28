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
import {useRouter, useSearchParams} from 'next/navigation';
import {useEffect, useState} from 'react';
import {handleCreateBlankMetadataObject} from '@/app/utils/metadata/handleCreateBlankMetadataObject';

/**
 * Creates a new map document from a DistrictrMap and routes to the editor.
 * Shared by CreateButton and PlaceMapGrid's cards.
 */
export const useCreateMapDocument = (
  view: Partial<DistrictrMap>,
  isCommunity?: boolean,
  createTag?: string | null
) => {
  const router = useRouter();
  const userID = useMapStore(stat => stat.userID);
  const setUserID = useMapStore(stat => stat.setUserID);
  const setNotification = useMapStore(stat => stat.setNotification);
  const [isCreating, setIsCreating] = useState(false);
  const shouldMakeCommunity = isCommunity ?? routeManager.mapUrlRoute === MAP_ROUTES.COI;
  // The tag is stored in the map's metadata so tag-filtered galleries pick the
  // map up once its draft status moves past scratch. A CMS-configured tag wins;
  // otherwise a ?tag=... on the hosting page (e.g. a workshop portal) applies.
  const urlTag = useSearchParams().get('tag');
  const tag = createTag ?? urlTag;

  useEffect(() => {
    !userID && setUserID();
  }, [userID, setUserID]);

  const createPlan = async () => {
    if (!view.districtr_map_slug || isCreating) return;
    setIsCreating(true);
    const r = await createMapDocument({
      districtr_map_slug: view.districtr_map_slug,
      map_type: shouldMakeCommunity ? MAP_TYPES.COMMUNITY : view.map_type,
      ...(tag ? {metadata: {...handleCreateBlankMetadataObject(), tags: [tag]}} : {}),
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

  return {createPlan, isCreating};
};

export const CreateButton: React.FC<{
  view: Partial<DistrictrMap>;
  extraClasses?: string;
  isCommunity?: boolean;
  createTag?: string | null;
}> = ({view, extraClasses, isCommunity, createTag}) => {
  const {createPlan, isCreating} = useCreateMapDocument(view, isCommunity, createTag);

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
