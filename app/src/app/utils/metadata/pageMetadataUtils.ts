import {Metadata} from 'next';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {API_URL} from '@/app/utils/api/constants';
import {routeForType} from '@constants/document/routes';

export const DISTRICTR_LOGO = {
  url: '/districtr_logo.jpg',
  width: 1136,
  height: 423,
};

export const OG_IMAGE_SIZE = {width: 1200, height: 630};

// document_id UUIDs are the edit capability ("password"); public share links use numeric public_id
export const isEditUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const publicShareUrl = (doc: DocumentObject | null) =>
  doc?.public_id ? `districtr.org/${routeForType(doc.map_type)}/${doc.public_id}` : null;

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

  if (isEditUuid(id)) {
    // Never advertise map details on a link that grants edit access
    const doc = await fetch(`${API_URL}/api/document/${id}`, {next: {revalidate: 300}})
      .then(res => (res.ok ? (res.json() as Promise<NonNullable<DocumentObject>>) : null))
      .catch(() => null);
    const shareUrl = publicShareUrl(doc);
    const title = '🔒 This link grants edit access';
    const description =
      'Treat it like a password — anyone who has it can change this map. ' +
      (shareUrl
        ? `To share publicly, use ${shareUrl} instead.`
        : 'Only send it to people you trust.');
    const ogImageUrl = `/api/og/${id}`;
    return {
      title,
      description,
      robots: {index: false, follow: false},
      openGraph: {
        title,
        description,
        siteName: 'Districtr 2.0',
        images: [{url: ogImageUrl, ...OG_IMAGE_SIZE}],
      },
      twitter: {card: 'summary_large_image', title, description, images: [ogImageUrl]},
    };
  }

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
      images: [{url: ogImageUrl, ...OG_IMAGE_SIZE}, DISTRICTR_LOGO],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}
