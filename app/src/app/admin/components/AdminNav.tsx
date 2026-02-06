'use client';

import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {pages} from '../config';

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex items-center gap-1">
      {pages.map(page => {
        const isActive = pathname.startsWith(page.href);
        return (
          <Link
            key={page.href}
            href={page.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            {page.title}
          </Link>
        );
      })}
    </div>
  );
}
