'use client';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import PermissionGuard from './components/PermissionGuard';

const navigationItems = [
  {
    name: 'Overview',
    href: '/admin/review',
    icon: '🏠',
  },
  {
    name: 'Comments',
    href: '/admin/review/comments',
    icon: '💬',
  },
  {
    name: 'Tags',
    href: '/admin/review/tags',
    icon: '🏷️',
  },
  {
    name: 'Commenters',
    href: '/admin/review/commenters',
    icon: '👤',
  },
];

export default function ReviewLayout({children}: {children: React.ReactNode}) {
  const pathname = usePathname();

  return (
    <PermissionGuard requiredScope="update:update-all">
      <div className="flex h-full">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-sm">
          <nav className="mt-5 px-2">
            <ul className="space-y-1">
              {navigationItems.map(item => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`${
                        isActive
                          ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      } group flex items-center px-2 py-2 text-sm font-medium rounded-l-md transition-colors duration-150 ease-in-out`}
                    >
                      <span className="mr-3">{item.icon}</span>
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <main className="flex-1 relative overflow-y-auto focus:outline-none">
            <div className="py-6">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </PermissionGuard>
  );
}
