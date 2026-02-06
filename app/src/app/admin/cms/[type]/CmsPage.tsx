'use client';

import React, {useEffect} from 'react';
import {CmsContentTypes} from '@/app/utils/api/cms';
import {Blockquote, Flex} from '@radix-ui/themes';
import {ContentPreviewModal} from '@/app/components/Cms/ContentPreviewModal';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {ContentList} from '@/app/components/Cms/ContentList';
import {ContentEditor, EditorActions} from '@/app/components/Cms/ContentEditor/ContentEditor';

export const CMSAdminPage: React.FC<{
  contentType: CmsContentTypes;
}> = ({contentType}) => {
  const error = useCmsFormStore(state => state.error);
  const success = useCmsFormStore(state => state.success);
  const loadAllData = useCmsFormStore(state => state.loadAllData);
  const switchContentType = useCmsFormStore(state => state.switchContentType);
  const session = useCmsFormStore(state => state.session);

  useEffect(() => {
    // Set the initial content type from the URL, then load all data
    switchContentType(contentType);
    loadAllData();
  }, [session]);

  return (
    <Flex direction="column" gap="3">
      {error && <Blockquote color="red">{error}</Blockquote>}
      {success && <Blockquote color="green">{success}</Blockquote>}

      <Flex
        direction={{initial: 'column', md: 'row'}}
        gap="4"
        className="w-full"
        align="start"
      >
        {/* Left sidebar - content list */}
        <div className="w-full md:w-72 shrink-0 md:sticky md:top-4 md:max-h-[calc(100vh-8rem)] md:overflow-hidden md:flex md:flex-col">
          <ContentList />
        </div>

        {/* Center - editor */}
        <div className="flex-1 min-w-0">
          <ContentEditor />
        </div>

        {/* Right sidebar - actions */}
        <div className="w-full md:w-48 shrink-0 md:sticky md:top-4">
          <EditorActions />
        </div>
      </Flex>

      <ContentPreviewModal />
    </Flex>
  );
};
