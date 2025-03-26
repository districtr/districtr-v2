'use client';

import React, {useEffect} from 'react';
import {CmsContentTypes} from '@/app/utils/api/cms';
import {Blockquote, Box, Heading, Flex} from '@radix-ui/themes';
// Use dynamic import for RichTextEditor to avoid SSR issues
import {ContentPreviewModal} from '@/app/components/Cms/ContentPreviewModal';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {ContentList} from '@/app/components/Cms/ContentList';
import {ContentEditor} from '@/app/components/Cms/ContentEditor/ContentEditor';

export const CMSAdminPage: React.FC<{
  contentType: CmsContentTypes;
}> = ({contentType}) => {
  const error = useCmsFormStore(state => state.error);
  const success = useCmsFormStore(state => state.success);
  const loadData = useCmsFormStore(state => state.loadData);
  const isLoaded = useCmsFormStore(state => state.maps.length);

  useEffect(() => {
    loadData(contentType);
  }, [contentType]);

  return (
    <Flex direction="column" gapY="4">
      <Heading as="h1" className="text-2xl font-bold">
        CMS Content Management: {contentType}
      </Heading>
      {error && <Blockquote color="red">{error}</Blockquote>}
      {success && <Blockquote color="green">{success}</Blockquote>}
      {!isLoaded ? (
        <Flex justify="center" align="center">
          <Box>Loading...</Box>
        </Flex>
      ) : (
        <>
          <ContentEditor />
          <ContentList />
          <ContentPreviewModal />
        </>
      )}
    </Flex>
  );
};
