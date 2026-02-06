import React, {useCallback, useEffect, useState} from 'react';
import {useCmsFormStore} from '@/app/store/cmsFormStore';
import {LANG_MAPPING} from '@/app/utils/language';
import {Badge, Button, Flex, Grid, Heading, Select, Separator, Spinner, Text, TextField} from '@radix-ui/themes';
import dynamic from 'next/dynamic';
import {CheckCircledIcon} from '@radix-ui/react-icons';
import {PlacesCMSContent} from '@/app/utils/api/cms';

const RichTextEditor = dynamic(() => import('@/app/components/Cms/RichTextEditor'), {ssr: false});

export const ContentEditor: React.FC = () => {
  const contentType = useCmsFormStore(state => state.contentType);
  const editingContent = useCmsFormStore(state => state.editingContent);
  const handleChange = useCmsFormStore(state => state.handleChange);
  const formData = useCmsFormStore(state => state.formData);
  const maps = useCmsFormStore(state => state.maps);

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

        {contentType === 'places' && (
          <Flex direction="column">
            <Text as="label" htmlFor="districtr_map_slug">
              Map (optional)
            </Text>
            <Select.Root
              // @ts-ignore
              value={formData?.content.districtr_map_slugs}
              onValueChange={handleChange('districtr_map_slugs', true)}
            >
              {' '}
              <Select.Trigger>
                <Text>
                  {(formData?.content as unknown as PlacesCMSContent)?.districtr_map_slugs?.length
                    ? (formData?.content as unknown as PlacesCMSContent)?.districtr_map_slugs
                        ?.length + ' maps selected'
                    : 'Select a map'}
                </Text>
              </Select.Trigger>
              <Select.Content>
                {maps.map((map, i) => (
                  <Select.Item key={i} value={map.districtr_map_slug}>
                    {/* @ts-ignore */}
                    <Flex direction="row" gapX="1">
                      {/* @ts-ignore */}
                      {formData?.content.districtr_map_slugs?.includes(map.districtr_map_slug) ? (
                        <CheckCircledIcon color="green" />
                      ) : null}
                      <Text>{map.name}</Text>
                    </Flex>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Flex>
        )}
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
    </Flex>
  );
};

/** Sticky action panel displayed in a right column next to the editor */
export const EditorActions: React.FC = () => {
  const editingContent = useCmsFormStore(state => state.editingContent);
  const formData = useCmsFormStore(state => state.formData);
  const cancelEdit = useCmsFormStore(state => state.cancelEdit);
  const handleSubmit = useCmsFormStore(state => state.handleSubmit);
  const setPreviewData = useCmsFormStore(state => state.setPreviewData);
  const session = useCmsFormStore(state => state.session);
  const handlePublish = useCmsFormStore(state => state.handlePublish);
  const contentType = useCmsFormStore(state => state.contentType);

  const [contentHasChanged, setContentHasChanged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canPublish = session?.tokenSet?.scope?.includes('update:publish') ?? false;

  useEffect(() => {
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
          JSON.stringify({title: currentEditContent.title, body: currentEditContent.body}) !==
          JSON.stringify({title: formData?.content.title, body: formData?.content.body});
        setContentHasChanged(contentChanged);
      }
    } else {
      setContentHasChanged(false);
    }
  }, [editingContent, formData]);

  const onSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await handleSubmit();
    } finally {
      setIsSubmitting(false);
    }
  }, [handleSubmit]);

  const status = editingContent
    ? editingContent.content.published_content && editingContent.content.draft_content
      ? 'edited'
      : editingContent.content.published_content
        ? 'published'
        : 'draft'
    : 'new';

  return (
    <Flex
      direction="column"
      gap="3"
      p="4"
      className="bg-white border border-gray-200 rounded-lg shadow-sm"
    >
      <Heading size="3" as="h3">
        Actions
      </Heading>

      {/* Status info */}
      <Flex direction="column" gap="1">
        <Text size="1" className="text-gray-500">
          Status
        </Text>
        {status === 'new' && <Badge color="gray">New</Badge>}
        {status === 'draft' && <Badge color="orange">Draft</Badge>}
        {status === 'published' && <Badge color="green">Published</Badge>}
        {status === 'edited' && <Badge color="blue">Unpublished Edits</Badge>}
      </Flex>

      {contentType && (
        <Flex direction="column" gap="1">
          <Text size="1" className="text-gray-500">
            Type
          </Text>
          <Text size="2" weight="medium">
            {contentType.charAt(0).toUpperCase() + contentType.slice(1)}
          </Text>
        </Flex>
      )}

      <Separator size="4" />

      {/* Primary action */}
      <Button onClick={onSubmit} disabled={!contentHasChanged || isSubmitting} className="w-full">
        {isSubmitting && <Spinner size="1" />}
        {editingContent ? 'Update Content' : 'Create Content'}
      </Button>

      {/* Secondary actions */}
      <Button
        variant="outline"
        className="w-full"
        onClick={() =>
          setPreviewData({
            title: formData!.content.title,
            body: formData!.content.body,
          })
        }
      >
        Preview
      </Button>

      {canPublish && editingContent && editingContent.content.draft_content && (
        <Button
          variant="soft"
          color="grass"
          className="w-full"
          onClick={() => handlePublish(editingContent.content.id)}
        >
          Publish
        </Button>
      )}

      {editingContent && (
        <>
          <Separator size="4" />
          <Button variant="outline" color="gray" className="w-full" onClick={cancelEdit}>
            Cancel Edit
          </Button>
        </>
      )}
    </Flex>
  );
};
