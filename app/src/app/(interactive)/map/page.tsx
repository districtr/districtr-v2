import {Metadata} from 'next';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import MapPage from '@/app/components/MapPage/MapPage';
import {API_URL} from '@/app/utils/api/constants';
import {redirect} from 'next/navigation';

const DISTRICTR_LOGO = {
  url: 'https://beta.districtr.org/districtr_logo.jpg',
  width: 1136,
  height: 423,
};

type MetadataProps = {
  searchParams: Promise<{document_id?: string | string[] | undefined}>;
};

export async function generateMetadata({searchParams}: MetadataProps): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const document_id = resolvedParams?.document_id ?? '';
  const singularDocumentId = Array.isArray(document_id) ? document_id[0] : document_id;
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
          url: `https://beta.districtr.org/api/og/${singularDocumentId}`,
          width: 1128,
          height: 600,
        },
        DISTRICTR_LOGO,
      ],
    },
  };
}

export default async function Map({
  searchParams,
}: {
  searchParams: Promise<{document_id?: string | string[] | undefined}>;
}) {
  const params = await searchParams;
  // if params.document_id is not undefined, redirect to edit/{document_id}
  if (params.document_id) {
    return redirect(`/map/edit/${params.document_id}`);
  }

  return <MapPage isEditing={false} mapId="" />;
}
