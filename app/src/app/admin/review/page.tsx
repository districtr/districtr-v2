'use client';
import {useRouter} from 'next/navigation';

export default function ReviewHome() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Comment Review Dashboard</h1>
        <p className="text-gray-600 mt-2">Review and moderate comments, tags, and commenters</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900">Comments</h3>
            <p className="mt-2 text-sm text-gray-500">
              Review and moderate user comments for appropriate content.
            </p>
            <button
              onClick={() => router.push('/admin/review/comments')}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Review Comments
            </button>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900">Tags</h3>
            <p className="mt-2 text-sm text-gray-500">
              Review and moderate tags used to categorize comments.
            </p>
            <button
              onClick={() => router.push('/admin/review/tags')}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Review Tags
            </button>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900">Commenters</h3>
            <p className="mt-2 text-sm text-gray-500">
              Review and moderate user accounts and their information.
            </p>
            <button
              onClick={() => router.push('/admin/review/commenters')}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Review Commenters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
