import type {Metadata} from 'next';

export const metadata: Metadata = {
  title: 'Districtr Admin',
  description: 'Districtr Admin Dashboard',
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white border-b border-gray-200 py-4 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-gray-800">Districtr Admin</h1>
          </div>
          <div className="flex items-center space-x-4">
            <a href="/admin/cms" className="text-gray-600 hover:text-gray-900">
              CMS
            </a>
            <a href="/" className="text-gray-600 hover:text-gray-900">
              Back to Site
            </a>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
