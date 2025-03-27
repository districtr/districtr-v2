import {create} from 'zustand';
import {MinimalPreviewData} from '../components/Cms/types';
import {
  AllCmsLists,
  AllCmsEntries,
  CmsContentTypes,
  listCMSContent,
  PlacesCMSContent,
  TagsCMSContent,
  createCMSContent,
  updateCMSContent,
  CMSContentCreate,
  deleteCMSContent,
  publishCMSContent,
  CMSContentUpdate,
} from '../utils/api/cms';
import {LANG_MAPPING} from '../utils/language';
import {subscribeWithSelector} from 'zustand/middleware';
import {DistrictrMap} from '../utils/api/apiHandlers/types';
import {getAvailableDistrictrMaps} from '../utils/api/apiHandlers/getAvailableDistrictrMaps';

// Base form data interface with common fields
interface BaseFormData {
  slug: string;
  language: keyof typeof LANG_MAPPING;
  title: string;
  subtitle: string;
  body: object;
}

// Key content type mapping - a single configuration object for all content types
type ContentTypeConfig = {
  tags: {
    formData: BaseFormData & {districtr_map_slug: string};
    cmsContent: TagsCMSContent;
  };
  places: {
    formData: BaseFormData & {districtr_map_slugs: string[]};
    cmsContent: PlacesCMSContent;
  };
};

// Helper types to extract information from the configuration
type FormDataType<T extends CmsContentTypes> = ContentTypeConfig[T]['formData'];
// Generic strongly typed form data and content types
type TypedFormData<T extends CmsContentTypes> = {contentType: T; content: FormDataType<T>};

// Default form data with base values
const baseFormData: BaseFormData = {
  slug: '',
  language: 'en',
  title: '',
  subtitle: '',
  body: {type: 'doc', content: [{type: 'paragraph', content: []}]},
};

// Default form data for each content type
const defaultFormData: {[K in CmsContentTypes]: FormDataType<K>} = {
  tags: {...baseFormData, districtr_map_slug: ''},
  places: {...baseFormData, districtr_map_slugs: []},
};

// Unified type guard - checks if a contentType matches a specific type
function isContentType<T extends CmsContentTypes>(
  contentType: CmsContentTypes | null,
  type: T
): contentType is T {
  return contentType === type;
}

// Helper to create typed form data
function createTypedFormData<T extends CmsContentTypes>(
  contentType: T,
  content: FormDataType<T>
): TypedFormData<T> {
  return {contentType, content};
}

// Store interface
interface CmsFormStore {
  // State
  content: AllCmsLists | null;
  contentType: CmsContentTypes | null;
  maps: DistrictrMap[];
  formData: TypedFormData<CmsContentTypes> | null;
  error: string;
  success: string;
  previewData: MinimalPreviewData;
  editingContent: AllCmsEntries | null;

  // Actions
  setContent: (content: AllCmsLists) => void;
  setPreviewData: (data: MinimalPreviewData) => void;
  loadData: (contentType: CmsContentTypes) => Promise<void>;
  loadMapList: () => Promise<DistrictrMap[] | undefined>;
  handleChange: <T extends keyof BaseFormData | 'districtr_map_slug' | 'districtr_map_slugs'>(
    property: T,
    multiple?: boolean
  ) => (value: any) => void;
  handleSubmit: () => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handlePublish: (id: string) => Promise<void>;
  handleEdit: (item: AllCmsEntries['content']) => void;
  cancelEdit: () => void;
}

export const useCmsFormStore = create(
  subscribeWithSelector<CmsFormStore>((set, get) => ({
    // Initial state
    content: null,
    contentType: null,
    maps: [],
    formData: null,
    error: '',
    success: '',
    previewData: null,
    editingContent: null,

    // Simple setters
    setContent: content => set({content}),
    setPreviewData: data => set({previewData: data}),

    // Load map data
    loadMapList: async () => {
      const existingMaps = get().maps;
      if (existingMaps.length) return existingMaps;
      return await getAvailableDistrictrMaps(100);
    },

    // Load content for a specific type
    loadData: async contentType => {
      console.log('Loading...');
      try {
        const [content, mapsData] = await Promise.all([
          listCMSContent(contentType),
          get().loadMapList(),
        ]);

        // Create typed form data from defaults
        const formData = createTypedFormData(
          contentType,
          structuredClone(defaultFormData[contentType])
        );

        set({
          content,
          contentType,
          maps: mapsData,
          formData,
        });
      } catch (err) {
        console.error('Error fetching data:', err);
        set({error: 'Failed to load data. Please try again.'});
      }
    },

    // Handle form field changes
    handleChange:
      (property, multiple = false) =>
      value => {
        const {contentType, formData: _formData} = get();
        if (!_formData || !contentType) return;

        if (!multiple) {
          // Create a new form data object with updated property
          const newFormData = {
            contentType: _formData.contentType,
            content: {
              ..._formData.content,
              [property]: value,
            },
          };
          set({formData: newFormData});
        } else {
          let newValue = (_formData.content[property as keyof typeof _formData.content] ??
            []) as string[];
          if (newValue.includes(value)) {
            newValue = newValue.filter(v => v !== value);
          } else {
            newValue.push(value);
          }
          const newFormData = {
            contentType: _formData.contentType,
            content: {
              ..._formData.content,
              [property]: newValue,
            },
          };
          set({formData: newFormData});
        }
      },

    // Submit form data (create or update)
    handleSubmit: async () => {
      set({error: '', success: ''});

      const {formData, editingContent, contentType} = get();
      if (!formData?.content || !contentType) return;

      try {
        // Common draft content object
        const draftContent = {
          title: formData.content.title,
          subtitle: formData.content.subtitle,
          body: formData.content.body,
        };

        if (editingContent) {
          // Updating existing content
          let content: CMSContentUpdate = {
            content_type: contentType,
            content_id: editingContent.content.id,
            updates: {
              slug: formData.content.slug,
              language: formData.content.language,
              draft_content: draftContent,
            },
          };

          // Add type-specific fields based on content type
          if (isContentType(contentType, 'tags')) {
            content.updates.districtr_map_slug =
              (formData.content as FormDataType<'tags'>).districtr_map_slug || undefined;
          } else if (isContentType(contentType, 'places')) {
            content.updates.districtr_map_slugs =
              (formData.content as FormDataType<'places'>).districtr_map_slugs || null;
          }
          await updateCMSContent(content);
          set({success: 'Content updated successfully!', editingContent: null});
        } else {
          // Creating new content
          let content: CMSContentCreate = {
            content_type: contentType,
            slug: formData.content.slug,
            language: formData.content.language,
            draft_content: draftContent,
            published_content: null,
          };

          // Add type-specific fields based on content type
          if (isContentType(contentType, 'tags')) {
            content.districtr_map_slug = (
              formData.content as FormDataType<'tags'>
            ).districtr_map_slug;
          } else if (isContentType(contentType, 'places')) {
            content.districtr_map_slugs = (
              formData.content as FormDataType<'places'>
            ).districtr_map_slugs;
          }

          await createCMSContent(content);
          set({success: 'Content created successfully!'});
        }

        // Refresh content list and reset form
        const newContent = await listCMSContent(contentType);
        const resetFormData = createTypedFormData(
          contentType,
          structuredClone(defaultFormData[contentType])
        );

        set({
          formData: resetFormData,
          content: newContent,
          editingContent: null,
        });
      } catch (err: any) {
        console.error('Error saving content:', err);
        set({error: err.response?.data?.detail || 'Failed to save content. Please try again.'});
      }
    },

    // Delete content
    handleDelete: async id => {
      if (!confirm('Are you sure you want to delete this content?')) return;

      try {
        const contentType = get().contentType;
        if (!contentType) {
          set({error: 'Failed to delete content. Please try again.'});
          return;
        }

        await deleteCMSContent(id, contentType);

        const currentContent = get().content;
        if (!currentContent) return;

        // Update content list without the deleted item
        const updatedContent = {
          contentType: currentContent.contentType,
          content: currentContent.content.filter(item => item.id !== id),
        } as AllCmsLists;

        set({
          success: 'Content deleted successfully!',
          content: updatedContent,
        });
      } catch (err) {
        console.error('Error deleting content:', err);
        set({error: 'Failed to delete content. Please try again.'});
      }
    },

    // Publish content
    handlePublish: async id => {
      try {
        const contentType = get().contentType;
        if (!contentType) {
          set({error: 'Failed to publish content. Please try again.'});
          return;
        }

        const updated = await publishCMSContent(id, contentType);

        const currentContent = get().content;
        if (!currentContent) return;

        // Update content list with the published item
        const updatedContent = {
          contentType: currentContent.contentType,
          content: currentContent.content.map(item => (item.id === id ? updated : item)),
        } as AllCmsLists;

        set({
          success: 'Content published successfully!',
          content: updatedContent,
        });
      } catch (err) {
        console.error('Error publishing content:', err);
        set({error: 'Failed to publish content. Please try again.'});
      }
    },

    // Edit existing content
    handleEdit: _item => {
      const contentType = get().contentType;
      if (!contentType) return;

      // Prepare item with proper content and status
      const item = {
        ..._item,
        draft_content: _item.draft_content ?? _item.published_content ?? null,
        status:
          _item.published_content && _item.draft_content
            ? 'new'
            : _item.published_content
              ? 'published'
              : 'draft',
      };

      // Common base form fields
      const baseFormFields: BaseFormData = {
        slug: item.slug,
        language: item.language,
        title: item.draft_content?.title || '',
        subtitle: item.draft_content?.subtitle || '',
        body: item.draft_content?.body || {
          type: 'doc',
          content: [{type: 'paragraph', content: []}],
        },
      };

      // Handle different content types
      if (isContentType(contentType, 'tags')) {
        const tagsItem = item as TagsCMSContent;

        set({
          editingContent: {
            contentType: 'tags',
            content: tagsItem,
          } as AllCmsEntries,
          formData: createTypedFormData('tags', {
            ...baseFormFields,
            districtr_map_slug: tagsItem.districtr_map_slug || '',
          }),
        });
      } else if (isContentType(contentType, 'places')) {
        const placesItem = item as PlacesCMSContent;

        set({
          editingContent: {
            contentType: 'places',
            content: placesItem,
          } as AllCmsEntries,
          formData: createTypedFormData('places', {
            ...baseFormFields,
            districtr_map_slugs: placesItem.districtr_map_slugs || [],
          }),
        });
      }
    },

    // Cancel edit mode
    cancelEdit: () => {
      const contentType = get().contentType;
      if (!contentType) return;

      set({
        editingContent: null,
        formData: createTypedFormData(contentType, structuredClone(defaultFormData[contentType])),
      });
    },
  }))
);
