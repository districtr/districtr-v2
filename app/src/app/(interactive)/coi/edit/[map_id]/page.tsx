import React from 'react';
import CoiMapPage from '@/app/components/MapPage/CoiMapPage';
import {generateMapPageMetadata} from '@/app/utils/metadata/pageMetadataUtils';

export const generateMetadata = async ({params}: {params: Promise<{map_id: string}>}) => {
  const {map_id} = await params;
  return generateMapPageMetadata({searchParams: Promise.resolve({document_id: map_id})});
};

export default async function CoiEditPage({params}: {params: Promise<{map_id: string}>}) {
  const {map_id} = await params;
  return <CoiMapPage isEditing={true} documentId={map_id} />;
}
