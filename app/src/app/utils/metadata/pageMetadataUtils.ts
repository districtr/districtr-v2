import {Metadata} from 'next';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {API_URL} from '@/app/utils/api/constants';

export const DISTRICTR_LOGO = {
  url: '/districtr_logo.jpg',
  width: 1136,
  height: 423,
};

export type MetadataProps = {
  params?: Promise<{map_id?: string}>;
  searchParams?: Promise<{document_id?: string | string[] | undefined}>;
};

export async function generateMapPageMetadata({
  params,
  searchParams,
}: MetadataProps): Promise<Metadata> {
  const mapId = (await params)?.map_id;
  const docParam = (await searchParams)?.document_id;
  const id = mapId ?? (Array.isArray(docParam) ? docParam[0] : docParam) ?? '';
  let mapDocument: DocumentObject | null = null;
  if (id) {
    mapDocument = await fetch(`${API_URL}/api/document/${id}`, {next: {revalidate: 300}})
      .then(res => (res.ok ? (res.json() as Promise<NonNullable<DocumentObject>>) : null))
      .catch(() => null);
  }
  if (!mapDocument) {
    // No document: fall back to the site-wide metadata from the root layout
    return {};
  }

  const title = [mapDocument.map_metadata?.name || 'Districtr Map', mapDocument.map_module]
    .filter(Boolean)
    .join(' | ');
  const details = mapDocument.num_districts ? `${mapDocument.num_districts} districts` : null;
  const description =
    [mapDocument.map_metadata?.description, details].filter(Boolean).join(' — ') ||
    'Create districting maps';
  const ogImageUrl = `/api/og/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'Districtr 2.0',
      images: [{url: ogImageUrl, width: 1128, height: 600}, DISTRICTR_LOGO],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}
