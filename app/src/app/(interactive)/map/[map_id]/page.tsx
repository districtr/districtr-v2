import React from 'react';
import MapPage from '@/app/components/MapPage/MapPage';
import {generateMapPageMetadata} from '@/app/utils/metadata/pageMetadataUtils';
import {MapPageProps} from '../types';

export const generateMetadata = generateMapPageMetadata;

export default async function ViewPage({params}: MapPageProps) {
  const {map_id} = await params;
  return <MapPage isEditing={false} mapId={map_id} />;
}
