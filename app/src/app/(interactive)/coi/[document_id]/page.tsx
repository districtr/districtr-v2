import React from 'react';
import CoiMapPage from '@/app/components/MapPage/CoiMapPage';
import {generateMapPageMetadata} from '@/app/utils/metadata/pageMetadataUtils';

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{document_id: string}>;
}) => {
  const {document_id} = await params;
  return generateMapPageMetadata({searchParams: Promise.resolve({document_id})});
};

export default async function CoiViewPage({
  params,
}: {
  params: Promise<{document_id: string}>;
}) {
  const {document_id} = await params;
  return <CoiMapPage isEditing={false} documentId={document_id} />;
}
