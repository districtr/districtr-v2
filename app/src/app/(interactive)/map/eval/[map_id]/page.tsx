import React from 'react';
import MapPage from '@/app/components/MapPage/MapPage';
import {generateMapPageMetadata} from '@/app/utils/metadata/pageMetadataUtils';
import {MapPageProps} from '../../types';

export const generateMetadata = generateMapPageMetadata;

export default async function EvalPage({params}: MapPageProps) {
  const {map_id} = await params;
  return <MapPage isEditing={false} isEval={true} mapId={map_id} />;
}
