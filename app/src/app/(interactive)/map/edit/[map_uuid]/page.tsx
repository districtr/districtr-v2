'use client';
import React from 'react';
import MapPage from '@/app/components/MapPage/MapPage';
import {useMapBrowserEvents} from '@/app/hooks/useMapBrowserEventsV2';
import {Metadata} from 'next';
import {getDocument} from '@/app/utils/api/apiHandlers/getDocument';

interface EditPageProps {
  params: {
    map_uuid: string;
  };
}

// export async function generateMetadata({params}: EditPageProps): Promise<Metadata> {
//   const {map_uuid} = params;

//   try {
//     const mapDocument = await getDocument(map_uuid);
//     const districtCount = mapDocument?.num_districts
//       ? `${mapDocument.num_districts} districts`
//       : '';

//     return {
//       title: `Edit ${mapDocument?.map_metadata?.name ?? 'Map'} - Districtr 2.0`,
//       description: mapDocument?.map_metadata?.description ?? 'Edit this districting map',
//       openGraph: {
//         title: districtCount
//           ? `Edit ${districtCount} - ${mapDocument?.map_metadata?.name ?? 'Map'}`
//           : `Edit ${mapDocument?.map_metadata?.name ?? 'Map'}`,
//         description: mapDocument?.map_metadata?.description ?? 'Edit this districting map',
//         siteName: 'Districtr 2.0',
//       },
//     };
//   } catch (error) {
//     return {
//       title: 'Map Not Found - Districtr 2.0',
//       description: 'The requested map could not be found',
//     };
//   }
// }

export default function EditPage({params}: EditPageProps) {
  const {map_uuid} = params;

  // Use the new browser events hook with edit mode
  useMapBrowserEvents({
    mapId: map_uuid,
    isEditing: true,
  });

  return <MapPage isEditing={true} />;
}
