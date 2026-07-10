import React, {useEffect, useState} from 'react';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {LANG_MAPPING} from '@/app/utils/language';
import {Box, Button, Flex, Grid, Heading, Select, Text, TextField} from '@radix-ui/themes';
import dynamic from 'next/dynamic';
import {MapMultiSelector} from './MapMultiSelector';

const RichTextEditor = dynamic(() => import('@/app/components/Cms/RichTextEditor'), {ssr: false});

export const ContentEditor: React.FC = () => {
  const contentType = useCmsFormStore(state => state.contentType);
  const editingContent = useCmsFormStore(state => state.editingContent);
  const handleChange = useCmsFormStore(state => state.handleChange);
  const formData = useCmsFormStore(state => state.formData);
  const maps = useCmsFormStore(state => state.maps);
  // const setFormData = useCmsFormStore(state => state.setFormData);
  const cancelEdit = useCmsFormStore(state => state.cancelEdit);
  const handleSubmit = useCmsFormStore(state => state.handleSubmit);
  const setPreviewData = useCmsFormStore(state => state.setPreviewData);
  const [contentHasChanged, setContentHasChanged] = useState(false);

  useEffect(() => {
    // Everything the form can edit and save — including the map selections, so
    // e.g. only reordering a place page's maps still enables Update Content.
    // Nullish fields normalize so an absent saved field equals an empty draft.
    const comparable = (input?: object) => {
      const content = (input ?? {}) as Record<string, unknown>;
      return {
        title: content.title,
        body: content.body,
        districtr_map_slug: content.districtr_map_slug ?? null,
        districtr_map_slugs: content.districtr_map_slugs ?? [],
      };
    };
    if (
      !editingContent &&
      formData?.content.slug &&
      formData?.content.language &&
      formData?.content.title
    ) {
      setContentHasChanged(true);
    } else if (editingContent) {
      const currentEditContent =
        editingContent.content.draft_content || editingContent.content.published_content;
      if (!currentEditContent) {
        setContentHasChanged(false);
      } else {
        const contentChanged =
          JSON.stringify(comparable(currentEditContent)) !==
          JSON.stringify(comparable(formData?.content));
        setContentHasChanged(contentChanged);
      }
    } else {
      setContentHasChanged(false);
    }
  }, [editingContent, formData]);

  return (
    <Flex direction="column" gapY="4" p="6" className="bg-white shadow rounded-lg">
      <Heading as="h2" className="text-xl font-semibold">
        {editingContent ? 'Edit Content' : 'Create New Content'}
        {editingContent && (
          <span className="ml-2 text-sm text-gray-500">Editing: {editingContent.content.slug}</span>
        )}
      </Heading>
      <Grid
        columns={{
          initial: '1',
          md: '2',
        }}
        gapX={{
          initial: '4',
          md: '8',
        }}
        gapY={{
          initial: '2',
          md: '4',
        }}
      >
        <Flex direction="column" gapY="2">
          <Text htmlFor="title" as="label">
            Title *
          </Text>
          <TextField.Root
            value={formData?.content?.title}
            onChange={e => handleChange('title')(e.target.value)}
            placeholder="Page Title"
          />
        </Flex>

        <Flex direction="column" gapY="2">
          <Text as="label" htmlFor="slug">
            Slug (URL path) *
          </Text>
          <TextField.Root
            value={formData?.content.slug}
            onChange={e => handleChange('slug')(e.target.value)}
            placeholder="texas-districts"
            disabled={!!editingContent}
          />
        </Flex>

        <Flex direction="column" gapY="2">
          <Text as="label" htmlFor="language">
            Language *
          </Text>
          <Select.Root
            required
            value={formData?.content.language}
            onValueChange={handleChange('language')}
          >
            {' '}
            <Select.Trigger />
            <Select.Content>
              {Object.entries(LANG_MAPPING).map(([abbr, language], i) => (
                <Select.Item key={i} value={abbr}>
                  {language}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>

        {contentType === 'tags' && (
          <Flex direction="column" gapY="2">
            <Text as="label" htmlFor="districtr_map_slug">
              Map
            </Text>
            <Select.Root
              // @ts-ignore
              value={formData?.content.districtr_map_slug}
              // @ts-ignore
              onValueChange={handleChange('districtr_map_slug')}
            >
              <Select.Trigger placeholder="Select a map" />
              <Select.Content>
                {maps?.map((map, i) => (
                  <Select.Item value={map.districtr_map_slug} key={i}>
                    {map.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Flex>
        )}

        {contentType === 'places' && <MapMultiSelector />}
      </Grid>
      <Flex direction={'column'} gapY="2">
        <Text as="label" htmlFor="body">
          Body Content *
        </Text>
        <RichTextEditor
          content={formData?.content.body || {}}
          onChange={handleChange('body')}
          // weird formatting, do not include a placeholder
          placeholder=""
        />
        <Text>Use the toolbar to format text, add links, and insert images.</Text>
      </Flex>

      <Flex direction="row" gapX="4" justify={'end'}>
        {editingContent && (
          <Button variant="outline" onClick={cancelEdit} disabled={!contentHasChanged}>
            Cancel Edit
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() =>
            setPreviewData({
              title: formData!.content.title,
              body: formData!.content.body,
            })
          }
        >
          Preview
        </Button>
        <Button onClick={handleSubmit} disabled={!contentHasChanged}>
          {editingContent ? 'Update Content' : 'Create Content'}
        </Button>
      </Flex>
    </Flex>
  );
};
