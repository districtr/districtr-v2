import {redirect} from 'next/navigation';
import {generateMapPageMetadata} from '@/app/utils/metadata/pageMetadataUtils';
import CoiMapPage from '@/app/components/MapPage/CoiMapPage';

export const generateMetadata = generateMapPageMetadata;

export default async function CoiMap({
  searchParams,
}: {
  searchParams: Promise<{document_id?: string | string[] | undefined}>;
}) {
  const params = await searchParams;
  // if params.document_id is not undefined, redirect to edit/{document_id}
  if (params.document_id) {
    return redirect(`/coi/edit/${params.document_id}`);
  }

  return <CoiMapPage isEditing={false} documentId="" />;
}
