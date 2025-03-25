'use client';
export default function CmsHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Districtr Admin Dashboard: CMS</h1>
        <p className="text-gray-600 mt-2">Manage your Districtr application content and settings</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900">Tags</h3>
            <p className="mt-2 text-sm text-gray-500">
              Pages for specific problems, like Cook County Redistricting or Detroit School Board
              Districts.
            </p>
            <a
              href="/admin/cms/tags"
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go to Tags
            </a>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900">Places</h3>
            <p className="mt-2 text-sm text-gray-500">
              General pages for places, like states or counties.
            </p>
            <a
              href="/admin/cms/places"
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go to Places
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
