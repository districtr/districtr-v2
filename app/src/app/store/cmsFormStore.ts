// const [content, setContent] = useState<AllCmsContent[]>([]);
// const [maps, setMaps] = useState<DistrictrMap[]>([]);
// const [loading, setLoading] = useState(true);
// const [formData, setFormData] = useState(structuredClone(allBaseFormData[contentType]));
// const [error, setError] = useState('');
// const [success, setSuccess] = useState('');
// const [previewData, setPreviewData] = useState<{title: string; body: object | string} | null>(
//   null
// );
// const [editingContent, setEditingContent] = useState<AllCmsContent | null>(null);

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

interface BaseFormData {
  slug: string;
  language: keyof typeof LANG_MAPPING;
  title: string;
  subtitle: string;
  body: object;
}
interface TagsFormData extends BaseFormData {
  districtr_map_slug: string;
}
interface PlacesFormData extends BaseFormData {
  districtr_map_slugs: string[];
}
type AllFormFields = BaseFormData | TagsFormData | PlacesFormData;

type AllFormData =
  | {
      contentType: 'tags';
      content: TagsFormData;
    }
  | {
      contentType: 'places';
      content: PlacesFormData;
    };

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
const tagsBaseFormData: TagsFormData = {
  ...baseFormData,
  districtr_map_slug: '',
};
const placesBaseFormData: PlacesFormData = {
  ...baseFormData,
  districtr_map_slugs: [],
};

const allBaseFormData: Record<CmsContentTypes, TagsFormData | PlacesFormData> = {
  tags: tagsBaseFormData,
  places: placesBaseFormData,
};

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
        set({
          content,
          contentType,
          maps: mapsData,
          formData: {
            contentType,
            content: structuredClone(allBaseFormData[contentType]),
          } as AllFormData,
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
      const newFormData = {
        contentType: _formData.contentType,
        content: {
          ..._formData?.content,
          [property]: value,
        },
      } as AllFormData;
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
          let content: Partial<CMSContentCreate> = {
            slug: formData.content.slug,
            language: formData.content.language,
            draft_content: draftContent,
          };

          switch (contentType) {
            case 'tags':
              content = {
                ...content,
                // @ts-ignore
                districtr_map_slug: (formData.content as TagsFormData).districtr_map_slug || null,
              };
              break;
            case 'places':
              content = {
                ...content,
                districtr_map_slugs:
                  (formData.content as PlacesFormData).districtr_map_slugs || null,
              };
              break;
          }
          await updateCMSContent(editingContent.content.id, contentType, content);
          set({
            success: 'Content updated successfully!',
            editingContent: null, // Exit edit mode
          });
        } else {
          let content: CMSContentCreate = {
            slug: formData.content.slug,
            language: formData.content.language,
            draft_content: draftContent,
            published_content: null,
            districtr_map_slug:
              contentType === 'tags'
                ? (formData.content as TagsFormData).districtr_map_slug
                : undefined,
            districtr_map_slugs:
              contentType === 'places'
                ? (formData.content as PlacesFormData).districtr_map_slugs
                : undefined,
          };
          // Create new content
          await createCMSContent(content, contentType);
          set({
            success: 'Content created successfully!',
          });
        }

        // Refresh content list
        const newContent = await listCMSContent(contentType);

        // Reset form
        set({
          formData: {
            contentType,
            content: structuredClone(allBaseFormData[contentType]),
          } as AllFormData,
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
          set({
            success: 'Content deleted successfully!',
            content: {
              ...get().content,
              content: get().content?.content.filter(item => item.id !== id) || [],
            } as AllCmsLists,
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
        set({
          success: 'Content published successfully!',
          content: {
            ...get().content,
            content: get().content?.content.map(item => (item.id === id ? updated : item)) || [],
          } as AllCmsLists,
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
      let formData: Partial<AllFormData['content']> = {
        slug: item.slug,
        language: item.language,
        title: item.draft_content?.title || '',
        subtitle: item.draft_content?.subtitle || '',
        body: item.draft_content?.body || {
          type: 'doc',
          content: [{type: 'paragraph', content: []}],
        },
      };
      switch (contentType) {
        case 'tags':
          formData = {
            ...formData,
            // @ts-ignore
            districtr_map_slug: item.districtr_map_slug,
          };
          break;
        case 'places':
          formData = {
            ...formData,
            // @ts-ignore
            districtr_map_slugs: item.districtr_map_slugs,
          };
          break;
      }
      set({
        // @ts-ignore
        editingContent: {contentType, content: item},
        // @ts-ignore
        formData: {contentType, content: formData},
      });
    },
    cancelEdit: () => {
      const contentType = get().contentType;
      if (!contentType) return;
      set({
        editingContent: null,
        formData: {
          contentType,
          content: structuredClone(allBaseFormData[contentType]),
        } as AllFormData,
      });
    },
  }))
);
