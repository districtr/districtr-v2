'use client';
import {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {LEGACY_DISTRICTR_URL} from '@/app/constants/legacy';

/**
 * Asks the server whether `path` exists on legacy Districtr and builds the URL
 * to send people to. The current query string rides along on both.
 *
 * `exists` is undefined while checking and if the check itself failed — callers
 * decide whether that means "offer nothing" or "redirect anyway".
 */
export const useLegacyCheck = (path?: string | null) => {
  // ponytail: search read from window rather than useSearchParams, which forces
  // prerendered pages (/_not-found) to bail to client rendering. null until mounted
  // so the query doesn't fire once without the search and again with it.
  const [search, setSearch] = useState<string | null>(null);
  useEffect(() => setSearch(window.location.search), []);

  const {data, isLoading} = useQuery({
    queryKey: ['legacy-check', path, search],
    enabled: Boolean(path) && search !== null,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`/api/legacy-check?path=${encodeURIComponent(`${path}${search}`)}`);
      const {exists} = await res.json();
      return Boolean(exists);
    },
  });

  return {
    legacyUrl: path ? `${LEGACY_DISTRICTR_URL}${path}${search ?? ''}` : '',
    exists: data,
    isChecking: isLoading || search === null,
  };
};
