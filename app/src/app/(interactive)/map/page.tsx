import {Metadata} from 'next';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import MapPage from '@/app/components/MapPage/MapPage';
import {API_URL} from '@/app/utils/api/constants';
import {redirect} from 'next/navigation';
import { generateMapPageMetadata } from '@/app/utils/metadata/pageMetadataUtils';

export const generateMetadata = generateMapPageMetadata

export default async function Map({
  searchParams,
}: {
  searchParams: Promise<{document_id?: string | string[] | undefined}>;
}) {
  const params = await searchParams;
  // if params.document_id is not undefined, redirect to edit/{document_id}
  if (params.document_id) {
    return redirect(`/map/edit/${params.document_id}`);
  }

  return <MapPage isEditing={false} mapId="" />;
}
