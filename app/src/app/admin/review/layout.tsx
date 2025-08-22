'use client';
import {usePathname, useRouter} from 'next/navigation';
import Link from 'next/link';
import PermissionGuard from './components/PermissionGuard';
import {Box, Flex} from '@radix-ui/themes';

const navigationItems = [
  {
    name: 'Overview',
    href: '/admin/review',
  },
  {
    name: 'Comments',
    href: '/admin/review/comments',
  },
  {
    name: 'Tags',
    href: '/admin/review/tags',
  },
  {
    name: 'Commenters',
    href: '/admin/review/commenters',
  },
];

export default function ReviewLayout({children}: {children: React.ReactNode}) {
  const pathname = usePathname();

  return (
    <PermissionGuard requiredScope="update:update-all">
      <Flex direction="row" gap="2" align="start" justify="between" className="h-full w-full">
        {/* Sidebar */}
        <Flex direction="column" className="w-64 bg-white shadow-sm p-4">
          <Flex direction="column" gap="2" justify="between" className="w-full">
            {navigationItems.map(item => {
              const isActive = pathname === item.href;
              return (
                <Flex direction="row" gap="2" align="start" justify="between" key={item.name}>
                  <Link
                    href={item.href}
                    className={`w-full px-4 py-2 ${
                      isActive
                        ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {item.name}
                  </Link>
                </Flex>
              );
            })}
          </Flex>
        </Flex>

        {/* Main content */}
        <Box className="flex-1 w-full">
          <Flex
            direction="column"
            gap="2"
            align="start"
            justify="between"
            className="flex-1 relative overflow-y-auto focus:outline-none w-full"
            id="inner-1"
          >
            <Flex direction="column" gap="2" align="start" justify="between" className="py-6 w-full" id="inner-2">
              <Flex
                direction="column"
                gap="2"
                id="inner-3"
                align="start"
                justify="between"
                className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 w-full"
              >
                {children}
              </Flex>
            </Flex>
          </Flex>
        </Box>
      </Flex>
    </PermissionGuard>
  );
}
