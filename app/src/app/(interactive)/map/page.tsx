import React from 'react';
import type {Metadata} from 'next';
import MapPageComponent from './component';
import {getDocument} from '@utils/api/apiHandlers/getDocument';
import {type DocumentObject} from '@utils/api/apiHandlers/types';

type MetadataProps = {
  searchParams: Promise<{document_id?: string | string[] | undefined}>;
};

const DISTRICTR_LOGO = [
  {
    url: 'https://districtr-v2-frontend.fly.dev/_next/image?url=%2Fdistrictr_logo.jpg&w=1920&q=75',
    width: 1136,
    height: 423,
  },
];

export async function generateMetadata({searchParams}: MetadataProps): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const document_id = resolvedParams?.document_id ?? '';
  const singularDocumentId = Array.isArray(document_id) ? document_id[0] : document_id;
  let mapDocument: DocumentObject | null = null;
  if (singularDocumentId) {
    mapDocument = await getDocument(singularDocumentId);
  }
  const districtCount = mapDocument?.num_districts ? `${mapDocument.num_districts} districts` : '';
  return {
    title: 'Districtr 2.0',
    openGraph: {
      title: districtCount
        ? `${districtCount} - ${mapDocument?.map_metadata?.name ?? 'Shared Map'}`
        : (mapDocument?.map_metadata?.name ?? 'Get Started'),
      description: mapDocument?.map_metadata?.description ?? 'Create districting maps',
      siteName: 'Districtr 2.0',
      images: DISTRICTR_LOGO,
    },
  };
}

export default function Map() {
  return <MapPageComponent />;
}
