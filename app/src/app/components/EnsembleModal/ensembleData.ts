'use client';
import {useQuery} from '@tanstack/react-query';
import {CDN_URL} from '@utils/api/constants';
import type {EnsembleIndex, EnsembleSegment, EnsembleSummary} from './ensembleTypes';

/**
 * Reads of the static ensemble package.
 *
 * The package is not environment-scoped: one copy per map module serves every
 * deployment, so the paths below carry no environment segment. Every file is
 * immutable for a given generation run, so queries never go stale within a
 * session.
 *
 * Transfer sizes decide what is fetched when: the index and the summary are
 * small enough (≈60 KB gzipped together) for the evaluation panel to load them
 * on open, while the segment (≈200 KB) and its thumbnails (0.5–1 MB for all
 * 100) are loaded only once the modal is open.
 */
const ensembleBase = (moduleSlug: string) => `${CDN_URL}/ensembles/${moduleSlug}`;

export const ensembleIndexUrl = (moduleSlug: string) => `${ensembleBase(moduleSlug)}/index.json`;

export const ensembleSummaryUrl = (moduleSlug: string, preset: string) =>
  `${ensembleBase(moduleSlug)}/${preset}/summary.json`;

export const ensembleSegmentUrl = (moduleSlug: string, preset: string) =>
  `${ensembleBase(moduleSlug)}/${preset}/segment.json`;

/** `step` is the index within the segment (0…99), not the plan number. */
export const ensembleThumbUrl = (moduleSlug: string, preset: string, step: number) =>
  `${ensembleBase(moduleSlug)}/${preset}/thumbs/${String(step).padStart(3, '0')}.svg`;

/** Shared by every reader of the package, so the panel and the modal fetch each
 * file once between them. */
export const ensembleQueryKeys = {
  index: (moduleSlug: string) => ['ensemble', 'index', moduleSlug] as const,
  summary: (moduleSlug: string, preset: string) =>
    ['ensemble', 'summary', moduleSlug, preset] as const,
  segment: (moduleSlug: string, preset: string) =>
    ['ensemble', 'segment', moduleSlug, preset] as const,
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return (await response.json()) as T;
};

/** A module without an ensemble has no package at all: its index 404s. */
export const fetchEnsembleIndex = (moduleSlug: string) =>
  fetchJson<EnsembleIndex>(ensembleIndexUrl(moduleSlug));

export const fetchEnsembleSummary = (moduleSlug: string, preset: string) =>
  fetchJson<EnsembleSummary>(ensembleSummaryUrl(moduleSlug, preset));

export const fetchEnsembleSegment = (moduleSlug: string, preset: string) =>
  fetchJson<EnsembleSegment>(ensembleSegmentUrl(moduleSlug, preset));

const STATIC_QUERY_OPTIONS = {
  staleTime: Infinity,
  gcTime: Infinity,
  retry: 1,
  refetchOnWindowFocus: false,
} as const;

export const useEnsembleSummary = (moduleSlug?: string, preset?: string, enabled = true) =>
  useQuery({
    queryKey: ensembleQueryKeys.summary(moduleSlug ?? '', preset ?? ''),
    queryFn: () => fetchEnsembleSummary(moduleSlug!, preset!),
    enabled: enabled && !!moduleSlug && !!preset,
    ...STATIC_QUERY_OPTIONS,
  });

export const useEnsembleSegment = (moduleSlug?: string, preset?: string, enabled = true) =>
  useQuery({
    queryKey: ensembleQueryKeys.segment(moduleSlug ?? '', preset ?? ''),
    queryFn: () => fetchEnsembleSegment(moduleSlug!, preset!),
    enabled: enabled && !!moduleSlug && !!preset,
    ...STATIC_QUERY_OPTIONS,
  });
