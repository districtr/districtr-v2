'use client';

import React, {useState, useEffect} from 'react';
import {
  createCMSContent,
  listCMSContent,
  deleteCMSContent,
  publishCMSContent,
  updateCMSContent,
  AllCmsContent,
  CmsContentTypes,
} from '@/app/utils/api/cms';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import type {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import dynamic from 'next/dynamic';

// Use dynamic import for RichTextEditor to avoid SSR issues
const RichTextEditor = dynamic(() => import('@/app/components/RichTextEditor'), {ssr: false});

const RichTextPreview = dynamic(() => import('@/app/components/RichTextPreview'), {ssr: false});

const baseFormData = {
  slug: '',
  language: 'en',
  title: '',
  subtitle: '',
  body: {
    type: 'doc',
    content: [{type: 'paragraph', content: []}],
  },
};
const tagsBaseFormData = {
  ...baseFormData,
  districtr_map_slug: '',
};
const placesBaseFormData = {
  ...baseFormData,
  districtr_map_slugs: [],
};

const allBaseFormData = {
  tags: tagsBaseFormData,
  places: placesBaseFormData,
} as const;
export const CMSAdminPage: React.FC<{
  contentType: CmsContentTypes;
}> = ({contentType}) => {
  const [content, setContent] = useState<AllCmsContent[]>([]);
  const [maps, setMaps] = useState<DistrictrMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(structuredClone(allBaseFormData[contentType]));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewData, setPreviewData] = useState<{title: string; body: object | string} | null>(
    null
  );
  const [editingContent, setEditingContent] = useState<AllCmsContent | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contentData, mapsData] = await Promise.all([
          listCMSContent(contentType),
          getAvailableDistrictrMaps(100),
        ]);
        setContent(contentData);
        setMaps(mapsData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const {name, value} = e.target;
    setFormData(prev => ({...prev, [name]: value}));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Create draft content object
      const draftContent = {
        title: formData.title,
        subtitle: formData.subtitle,
        body: formData.body,
      };

      if (editingContent) {
        // Update existing content
        const content = {
          slug: formData.slug,
          language: formData.language,
          draft_content: draftContent,
        };
        switch (contentType) {
          case 'tags':
            // @ts-ignore
            content.districtr_map_slug = formData.districtr_map_slug || null;
            break;
          case 'places':
            // @ts-ignore
            content.districtr_map_slugs = formData.districtr_map_slugs || null;
            break;
        }
        await updateCMSContent(editingContent.id, contentType, content);

        setSuccess('Content updated successfully!');
        setEditingContent(null); // Exit edit mode
      } else {
        const content = {
          slug: formData.slug,
          language: formData.language,
          draft_content: draftContent,
          published_content: null,
        };
        switch (contentType) {
          case 'tags':
            // @ts-ignore
            content.districtr_map_slug = formData.districtr_map_slug || null;
            break;
          case 'places':
            // @ts-ignore
            content.districtr_map_slugs = formData.districtr_map_slugs || null;
            break;
        }
        // Create new content
        await createCMSContent(content, contentType);

        setSuccess('Content created successfully!');
      }

      // Refresh content list
      const newContent = await listCMSContent(contentType);
      setContent(newContent);

      // Reset form
      setFormData(structuredClone(allBaseFormData[contentType]));
    } catch (err: any) {
      console.error('Error saving content:', err);
      setError(err.response?.data?.detail || 'Failed to save content. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this content?')) {
      try {
        await deleteCMSContent(id, contentType);
        setContent(content.filter(item => item.id !== id));
        setSuccess('Content deleted successfully!');
      } catch (err) {
        console.error('Error deleting content:', err);
        setError('Failed to delete content. Please try again.');
      }
    }
  };

  const handleEdit = (item: AllCmsContent) => {
    // Populate form with content to be edited
    setEditingContent(item);
    const formData = {
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
        // @ts-ignore
        formData.districtr_map_slug = item.districtr_map_slug || '';
        break;
      case 'places':
        // @ts-ignore
        formData.districtr_map_slugs = item.districtr_map_slugs || [];
        break;
    }
    // @ts-ignore
    setFormData(formData);

    // Scroll to the form
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const cancelEdit = () => {
    setEditingContent(null);
    // Reset form
    setFormData(structuredClone(allBaseFormData[contentType]));
  };

  const handlePublish = async (id: string) => {
    try {
      const updated = await publishCMSContent(id, contentType);
      setContent(content.map(item => (item.id === id ? updated : item)));
      setSuccess('Content published successfully!');
    } catch (err) {
      console.error('Error publishing content:', err);
      setError('Failed to publish content. Please try again.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">CMS Content Management</h1>

        {error && (
          <div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
            role="alert"
          >
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {success && (
          <div
            className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4"
            role="alert"
          >
            <span className="block sm:inline">{success}</span>
          </div>
        )}
      </div>

      {/* Create Content Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">
          {editingContent ? 'Edit Content' : 'Create New Content'}
          {editingContent && (
            <span className="ml-2 text-sm text-gray-500">Editing: {editingContent.slug}</span>
          )}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
                Slug (URL path) *
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                required
                value={formData.slug}
                onChange={handleChange}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                placeholder="e.g. about-page"
              />
            </div>

            <div>
              <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                Language *
              </label>
              <select
                id="language"
                name="language"
                required
                value={formData.language}
                onChange={handleChange}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="zh">Chinese</option>
                <option value="vi">Vietnamese</option>
                <option value="ht">Haitian</option>
                <option value="pt">Portuguese</option>
              </select>
            </div>

            {contentType === 'tags' && (
              <div>
                <label
                  htmlFor="districtr_map_slug"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Map (optional)
                </label>
                <select
                  id="districtr_map_slug"
                  name="districtr_map_slug"
                  // @ts-ignore
                  value={formData.districtr_map_slug}
                  onChange={handleChange}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                >
                  <option value="">None</option>
                  {maps.map(map => (
                    <option key={map.districtr_map_slug} value={map.districtr_map_slug}>
                      {map.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {contentType === 'places' && (
              <div>
                <label
                  htmlFor="districtr_map_slug"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Map (optional)
                </label>
                <select
                  id="districtr_map_slug"
                  name="districtr_map_slug"
                  // @ts-ignore
                  value={formData.districtr_map_slug}
                  onChange={e => {
                    const value = e.target.value;
                    setFormData(prev => {
                      // @ts-ignore
                      if (prev.districtr_map_slugs.includes(value)) {
                        return {
                          ...prev,
                          // @ts-ignore
                          districtr_map_slugs: prev.districtr_map_slugs.filter(
                            // @ts-ignore
                            slug => slug !== value
                          ),
                        };
                      }
                      return {
                        ...prev,
                        // @ts-ignore
                        districtr_map_slugs: [...prev.districtr_map_slugs, value],
                      };
                    });
                  }}
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                >
                  <option value="">None</option>
                  {maps.map(map => (
                    <option key={map.districtr_map_slug} value={map.districtr_map_slug}>
                      {/* @ts-ignore */}
                      {formData.districtr_map_slugs.includes(map.districtr_map_slug) ? '✅ ' : ''}
                      {map.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                value={formData.title}
                onChange={handleChange}
                className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                placeholder="Page Title"
              />
            </div>
          </div>
          <div>
            <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
              Body Content *
            </label>
            <RichTextEditor
              content={formData.body}
              // @ts-ignore
              onChange={json => setFormData(prev => ({...prev, body: json}))}
              // weird formatting, do not include a placeholder
              placeholder=""
            />
            <p className="mt-1 text-xs text-gray-500">
              Use the toolbar to format text, add links, and insert images.
            </p>
          </div>

          <div className="flex justify-end space-x-4">
            {editingContent && (
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setPreviewData({
                  title: formData.title,
                  body: formData.body,
                })
              }
              className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Preview
            </button>
            <button
              type="submit"
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {editingContent ? 'Update Content' : 'Create Content'}
            </button>
          </div>
        </form>
      </div>

      {/* Content List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <h2 className="text-xl font-semibold p-6 border-b">Content List</h2>

        {content.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No content found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Slug
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Title
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Language
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {content.map(item => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.slug}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.draft_content?.title || 'No title'}
                      <span className="text-xs text-gray-400 ml-2">
                        {item.draft_content?.body ? '(Rich content available)' : ''}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.language}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.published_content ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Published
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                          Draft
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handlePublish(item.id)}
                          disabled={!item.draft_content}
                          className={`text-white px-2 py-1 rounded text-xs ${
                            !item.draft_content
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          Publish
                        </button>
                        <button
                          onClick={() => handleEdit(item)}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-2 py-1 rounded text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                        >
                          Delete
                        </button>
                        {item.draft_content?.body && (
                          <button
                            onClick={() =>
                              setPreviewData({
                                title: item.draft_content?.title || '',
                                body: item.draft_content?.body || '',
                              })
                            }
                            className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                          >
                            Preview
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{previewData.title}</h2>
                <button
                  onClick={() => setPreviewData(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="border-t pt-4">
                <RichTextPreview content={previewData.body} />
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setPreviewData(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
