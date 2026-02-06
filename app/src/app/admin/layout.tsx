import type {Metadata} from 'next';
import {auth0, ClientSession} from '@/app/lib/auth0';
import {Providers} from '../utils/Providers';
import {redirect} from 'next/navigation';
import {AuthButton} from '../components/Auth/AuthButton';
import {Text} from '@radix-ui/themes';
import AdminNav from './components/AdminNav';
import Breadcrumbs from './components/Breadcrumbs';

export const metadata: Metadata = {
  title: 'Districtr Admin',
  description: 'Districtr Admin Dashboard',
};

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth0.getSession();
  const clientSession: ClientSession = {
    user: session?.user,
    tokenSet: session?.tokenSet,
  };

  if (!session?.user || !session?.tokenSet?.accessToken) {
    redirect('/auth/login?returnTo=/admin/cms');
  }

  return (
    <Providers session={clientSession}>
      <div className="min-h-screen bg-gray-100">
        <nav className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-14">
              <div className="flex items-center gap-8">
                <a href="/admin" className="text-xl font-semibold text-gray-800">
                  Districtr Admin
                </a>
                <AdminNav />
              </div>
              <div className="flex items-center space-x-4">
                <a href="/" className="text-sm text-gray-500 hover:text-gray-700">
                  Back to Site
                </a>
                <AuthButton />
              </div>
            </div>
          </div>
        </nav>
        <Breadcrumbs />
        {!!session?.user ? (
          <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">{children}</main>
        ) : (
          <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <Text>Please log in</Text>
          </main>
        )}
      </div>
    </Providers>
  );
}
