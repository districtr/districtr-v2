import React from 'react';
import MapPage from '@/app/components/MapPage/MapPage';
import {generateMapPageMetadata} from '@/app/utils/metadata/pageMetadataUtils';
import {MapPageProps} from '../../types';

export const generateMetadata = generateMapPageMetadata;

export default async function ReportPage({params}: MapPageProps) {
  const {public_id} = await params;
  return <MapPage isEditing={false} isEval={true} isReport={true} mapId={public_id} />;
}
