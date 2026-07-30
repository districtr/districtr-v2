import React from 'react';
import CoiMapPage from '@/app/components/MapPage/CoiMapPage';
import {generateMapPageMetadata} from '@/app/utils/metadata/pageMetadataUtils';

export const generateMetadata = generateMapPageMetadata;

export default async function CoiEditPage({params}: {params: Promise<{public_id: string}>}) {
  const {public_id} = await params;
  return <CoiMapPage isEditing={true} documentId={public_id} />;
}
