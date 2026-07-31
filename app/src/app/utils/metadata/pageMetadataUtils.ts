import {Metadata} from 'next';
import {headers} from 'next/headers';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {API_URL} from '@/app/utils/api/constants';

export type MetadataProps = {
  params?: Promise<{public_id?: string}>;
  searchParams?: Promise<{document_id?: string | string[] | undefined}>;
};

/** The serving environment's own origin — never a hardcoded domain, so OG
 * images/logo resolve correctly on dev/preview, not just production. */
async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  // x-forwarded-proto can be a comma-separated list when multiple proxies
  // are in the chain, each appending its own value — the first entry is
  // what the original client actually used.
  const protocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'https';
  const host = requestHeaders.get('host') ?? 'beta.districtr.org';
  return `${protocol}://${host}`;
}

/**
 * Every id-bearing map/coi route carries its id as a path segment
 * (`params.public_id`) — only the bare `/map` landing page (which redirects
 * based on a `?document_id=` query) still needs the searchParams fallback.
 */
export async function generateMapPageMetadata({
  params,
  searchParams,
}: MetadataProps): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const document_id = resolvedParams?.public_id ?? resolvedSearchParams?.document_id ?? '';
  const singularDocumentId = Array.isArray(document_id) ? document_id[0] : document_id;
  const origin = await getRequestOrigin();
  let mapDocument: DocumentObject | null = null;
  if (singularDocumentId) {
    mapDocument = await fetch(`${API_URL}/api/document/${singularDocumentId}`).then(res =>
      res.ok ? (res.json() as Promise<NonNullable<DocumentObject>>) : null
    );
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
      images: [
        {
          url: `${origin}/api/og/${singularDocumentId}`,
          width: 1128,
          height: 600,
        },
        {
          url: `${origin}/districtr_logo.jpg`,
          width: 1136,
          height: 423,
        },
      ],
    },
  };
}
