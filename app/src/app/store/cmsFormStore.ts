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

// Content type specific form data interfaces
interface TagsFormData extends BaseFormData {
  districtr_map_slug: string;
}

interface PlacesFormData extends BaseFormData {
  districtr_map_slugs: string[];
}

// Map content types to their form data types
type ContentFormDataMap = {
  'tags': TagsFormData;
  'places': PlacesFormData;
}

// Union type of all possible form field types
type AllFormFields = BaseFormData | TagsFormData | PlacesFormData;

// Generic form data type parameterized by content type
type FormData<T extends CmsContentTypes> = {
  contentType: T;
  content: ContentFormDataMap[T];
}

// Union type of all possible form data types
type AllFormData = FormData<'tags'> | FormData<'places'>;

// Base form data with default values
const baseFormData: BaseFormData = {
  slug: '',
  language: 'en',
  title: '',
  subtitle: '',
  body: {
    type: 'doc',
    content: [{type: 'paragraph', content: []}],
  },
};

// Content type specific form data with default values
const tagsBaseFormData: TagsFormData = {
  ...baseFormData,
  districtr_map_slug: '',
};

const placesBaseFormData: PlacesFormData = {
  ...baseFormData,
  districtr_map_slugs: [],
};

// Map content types to their base form data
const allBaseFormData: Record<CmsContentTypes, ContentFormDataMap[CmsContentTypes]> = {
  tags: tagsBaseFormData,
  places: placesBaseFormData,
};

// Type guard functions to check form data types
function isTagsFormData(formData: AllFormData): formData is FormData<'tags'> {
  return formData.contentType === 'tags';
}

function isPlacesFormData(formData: AllFormData): formData is FormData<'places'> {
  return formData.contentType === 'places';
}

// Type guard functions for content entries
function isTagsEntry(entry: AllCmsEntries): entry is { contentType: 'tags', content: TagsCMSContent } {
  return entry.contentType === 'tags';
}

function isPlacesEntry(entry: AllCmsEntries): entry is { contentType: 'places', content: PlacesCMSContent } {
  return entry.contentType === 'places';
}

// Store interface with generic methods
interface CmsFormStore {
  content: AllCmsLists | null;
  contentType: CmsContentTypes | null;
  setContent: (content: AllCmsLists) => void;
  maps: DistrictrMap[];
  formData: AllFormData | null;
  error: string;
  success: string;
  previewData: MinimalPreviewData;
  setPreviewData: (data: MinimalPreviewData) => void;
  editingContent: AllCmsEntries | null;
  loadData: (contentType: CmsContentTypes) => Promise<void>;
  loadMapList: () => Promise<DistrictrMap[] | undefined>;
  handleChange: <T extends keyof AllFormFields>(property: T) => (value: AllFormFields[T]) => void;
  handleSubmit: () => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handlePublish: (id: string) => Promise<void>;
  handleEdit: (item: AllCmsEntries['content']) => void;
  cancelEdit: () => void;
}

export const useCmsFormStore = create(
  subscribeWithSelector<CmsFormStore>((set, get) => ({
    content: null,
    contentType: null,
    setContent: content => set({content}),
    maps: [],
    formData: null,
    error: '',
    success: '',
    previewData: null,
    setPreviewData: data => set({previewData: data}),
    editingContent: null,
    loadMapList: async () => {
      const existingMaps = get().maps;
      if (existingMaps.length) return existingMaps;
      return await getAvailableDistrictrMaps(100);
    },
    loadData: async contentType => {
      console.log("Loading...")
      try {
        const [content, mapsData] = await Promise.all([
          listCMSContent(contentType),
          get().loadMapList(),
        ]);
        
        // Use type assertion with generic parameter
        const formData: FormData<typeof contentType> = {
          contentType,
          content: structuredClone(allBaseFormData[contentType]),
        };
        
        set({
          content,
          contentType,
          maps: mapsData,
          formData,
        });
      } catch (err) {
        console.error('Error fetching data:', err);
        set({
          error: 'Failed to load data. Please try again.',
        });
      }
    },
    handleChange: property => value => {
      const _formData = get().formData;
      if (!_formData) return;
      
      // Create a properly typed new form data object
      const newFormData: AllFormData = {
        contentType: _formData.contentType,
        content: {
          ..._formData.content,
          [property]: value,
        } as ContentFormDataMap[typeof _formData.contentType],
      };
      
      set({
        formData: newFormData,
      });
    },
    handleSubmit: async () => {
      set({
        error: '',
        success: '',
      });
      
      const {formData, editingContent, contentType} = get();
      if (!formData?.content || !contentType) return;
      
      try {
        // Create draft content object
        const draftContent = {
          title: formData.content.title,
          subtitle: formData.content.subtitle,
          body: formData.content.body,
        };

        if (editingContent) {
          // Update existing content
          // Base content object with common fields
          let content: Partial<CMSContentCreate> = {
            slug: formData.content.slug,
            language: formData.content.language,
            draft_content: draftContent,
          };

          // Add type-specific fields using type guards
          if (isTagsFormData(formData)) {
            content = {
              ...content,
              districtr_map_slug: formData.content.districtr_map_slug || null,
            };
          } else if (isPlacesFormData(formData)) {
            content = {
              ...content,
              districtr_map_slugs: formData.content.districtr_map_slugs || null,
            };
          }
          
          await updateCMSContent(editingContent.content.id, contentType, content);
          set({
            success: 'Content updated successfully!',
            editingContent: null, // Exit edit mode
          });
        } else {
          // Create new content with proper typing
          let content: CMSContentCreate = {
            slug: formData.content.slug,
            language: formData.content.language,
            draft_content: draftContent,
            published_content: null,
          };
          
          // Add type-specific fields using type guards
          if (isTagsFormData(formData)) {
            content.districtr_map_slug = formData.content.districtr_map_slug;
          } else if (isPlacesFormData(formData)) {
            content.districtr_map_slugs = formData.content.districtr_map_slugs;
          }
          
          // Create new content
          await createCMSContent(content, contentType);
          set({
            success: 'Content created successfully!',
          });
        }

        // Refresh content list
        const newContent = await listCMSContent(contentType);

        // Reset form with proper typing
        const resetFormData: FormData<typeof contentType> = {
          contentType,
          content: structuredClone(allBaseFormData[contentType]),
        };
        
        set({
          formData: resetFormData,
          content: newContent,
        });
      } catch (err: any) {
        console.error('Error saving content:', err);
        set({error: err.response?.data?.detail || 'Failed to save content. Please try again.'});
      }
    },
    handleDelete: async (id) => {
      if (confirm('Are you sure you want to delete this content?')) {
        try {
          const contentType = get().contentType;
          if (!contentType) {
            set({
              error: 'Failed to delete content. Please try again.',
            })
            return
          }
          await deleteCMSContent(id, contentType);
          
          const currentContent = get().content;
          if (!currentContent) return;
          
          // Create properly typed updated content
          const updatedContent: AllCmsLists = {
            contentType: currentContent.contentType,
            content: currentContent.content.filter(item => item.id !== id),
          };
          
          set({
            success: 'Content deleted successfully!',
            content: updatedContent,
          });
        } catch (err) {
          console.error('Error deleting content:', err);
          set({
            error: 'Failed to delete content. Please try again.',
          });
        }
      }
    },
    handlePublish: async (id) => {
      try {
        const contentType = get().contentType;
        if (!contentType) {
          set({
            error: 'Failed to publish content. Please try again.',
          });
          return;
        }
        
        const updated = await publishCMSContent(id, contentType);
        
        const currentContent = get().content;
        if (!currentContent) return;
        
        // Create properly typed updated content
        const updatedContent: AllCmsLists = {
          contentType: currentContent.contentType,
          content: currentContent.content.map(item => (item.id === id ? updated : item)),
        };
        
        set({
          success: 'Content published successfully!',
          content: updatedContent,
        });
      } catch (err) {
        console.error('Error publishing content:', err);
        set({
          error: 'Failed to publish content. Please try again.',
        });
      }
    },
    handleEdit: _item => {
      const contentType = get().contentType;
      if (!contentType) return;
      
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
      
      // Set up base form data fields
      let formData: Partial<BaseFormData> = {
        slug: item.slug,
        language: item.language,
        title: item.draft_content?.title || '',
        subtitle: item.draft_content?.subtitle || '',
        body: item.draft_content?.body || {
          type: 'doc',
          content: [{type: 'paragraph', content: []}],
        },
      };
      
      // Create type-specific form data based on content type
      let typedFormData: AllFormData;
      
      if (contentType === 'tags') {
        // Cast item to TagsCMSContent to access type-specific fields
        const tagsItem = item as TagsCMSContent;
        typedFormData = {
          contentType: 'tags',
          content: {
            ...formData as BaseFormData,
            districtr_map_slug: tagsItem.districtr_map_slug || '',
          },
        };
      } else if (contentType === 'places') {
        // Cast item to PlacesCMSContent to access type-specific fields
        const placesItem = item as PlacesCMSContent;
        typedFormData = {
          contentType: 'places',
          content: {
            ...formData as BaseFormData,
            districtr_map_slugs: placesItem.districtr_map_slugs || [],
          },
        };
      } else {
        // This should never happen if contentType is properly typed
        return;
      }
      
      // Create typed editing content
      const editingContent: AllCmsEntries = {
        contentType,
        content: item as (TagsCMSContent | PlacesCMSContent),
      };
      
      set({
        editingContent,
        formData: typedFormData,
      });
    },
    cancelEdit: () => {
      const contentType = get().contentType;
      if (!contentType) return;
      
      // Create properly typed reset form data
      const resetFormData: FormData<typeof contentType> = {
        contentType,
        content: structuredClone(allBaseFormData[contentType]),
      };
      
      set({
        editingContent: null,
        formData: resetFormData,
      });
    },
  }))
);