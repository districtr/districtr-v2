'use client';

import {useState, useEffect} from 'react';
import {
  createCMSContent,
  listCMSContent,
  deleteCMSContent,
  publishCMSContent,
  CMSContentResponse,
} from '@/app/utils/api/cms';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import type {DistrictrMap} from '@/app/utils/api/apiHandlers/types';

export default function CMSAdminPage() {
  const [content, setContent] = useState<CMSContentResponse[]>([]);
  const [maps, setMaps] = useState<DistrictrMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    slug: '',
    districtr_map_slug: '',
    language: 'en',
    title: '',
    subtitle: '',
    body: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contentData, mapsData] = await Promise.all([
          listCMSContent(),
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

      await createCMSContent({
        slug: formData.slug,
        districtr_map_slug: formData.districtr_map_slug || null,
        language: formData.language,
        draft_content: draftContent,
        published_content: null,
      });

      // Refresh content list
      const newContent = await listCMSContent();
      setContent(newContent);

      // Reset form
      setFormData({
        slug: '',
        districtr_map_slug: '',
        language: 'en',
        title: '',
        subtitle: '',
        body: '',
      });

      setSuccess('Content created successfully!');
    } catch (err: any) {
      console.error('Error creating content:', err);
      setError(err.response?.data?.detail || 'Failed to create content. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this content?')) {
      try {
        await deleteCMSContent(id);
        setContent(content.filter(item => item.id !== id));
        setSuccess('Content deleted successfully!');
      } catch (err) {
        console.error('Error deleting content:', err);
        setError('Failed to delete content. Please try again.');
      }
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const updated = await publishCMSContent(id);
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
        <h2 className="text-xl font-semibold mb-4">Create New Content</h2>

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
            <label htmlFor="subtitle" className="block text-sm font-medium text-gray-700 mb-1">
              Subtitle
            </label>
            <input
              id="subtitle"
              name="subtitle"
              type="text"
              value={formData.subtitle}
              onChange={handleChange}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              placeholder="Page Subtitle"
            />
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
              Body Content *
            </label>
            <textarea
              id="body"
              name="body"
              rows={5}
              required
              value={formData.body}
              onChange={handleChange}
              className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
              placeholder="Page content in markdown format..."
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Create Content
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
                          onClick={() => handleDelete(item.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
