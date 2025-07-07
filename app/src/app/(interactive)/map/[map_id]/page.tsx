'use client';
import React from 'react';
import MapPage from '@/app/components/MapPage/MapPage';
import {useMapBrowserEvents} from '@/app/hooks/useMapBrowserEventsV2';
import {Metadata} from 'next';
import {getDocument} from '@/app/utils/api/apiHandlers/getDocument';

interface ViewPageProps {
  params: {
    map_id: string;
  };
}

// export async function generateMetadata({params}: ViewPageProps): Promise<Metadata> {
//   const {map_id} = params;

//   try {
//     const mapDocument = await getDocument(map_id);
//     const districtCount = mapDocument?.num_districts
//       ? `${mapDocument.num_districts} districts`
//       : '';

//     return {
//       title: `${mapDocument?.map_metadata?.name ?? 'Shared Map'} - Districtr 2.0`,
//       description: mapDocument?.map_metadata?.description ?? 'View this districting map',
//       openGraph: {
//         title: districtCount
//           ? `${districtCount} - ${mapDocument?.map_metadata?.name ?? 'Shared Map'}`
//           : (mapDocument?.map_metadata?.name ?? 'Shared Map'),
//         description: mapDocument?.map_metadata?.description ?? 'View this districting map',
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

export default function ViewPage({params}: ViewPageProps) {
  const {map_id} = params;

  // Use the new browser events hook with view mode
  useMapBrowserEvents({
    mapId: map_id,
    isEditing: false,
  });

  return <MapPage isEditing={false} />;
}
