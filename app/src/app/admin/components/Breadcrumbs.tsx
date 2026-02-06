'use client';

import {usePathname} from 'next/navigation';
import {Flex, Text} from '@radix-ui/themes';
import {ChevronRightIcon} from '@radix-ui/react-icons';
import Link from 'next/link';

const LABEL_MAP: Record<string, string> = {
  admin: 'Admin',
  cms: 'CMS',
  review: 'Review',
  thumbnails: 'Thumbnails',
  tags: 'Tags',
  places: 'Places',
};

function humanize(segment: string): string {
  return LABEL_MAP[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  const crumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const isLast = index === segments.length - 1;
    const label = humanize(segment);

    return (
      <Flex key={href} align="center" gap="1">
        {index > 0 && <ChevronRightIcon className="text-gray-400" />}
        {isLast ? (
          <Text size="2" weight="medium" className="text-gray-700">
            {label}
          </Text>
        ) : (
          <Link href={href} className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
            {label}
          </Link>
        )}
      </Flex>
    );
  });

  return (
    <Flex align="center" gap="1" className="px-4 sm:px-6 lg:px-8 py-2 max-w-7xl mx-auto">
      {crumbs}
    </Flex>
  );
}
