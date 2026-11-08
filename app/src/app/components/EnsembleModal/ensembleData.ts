'use client';
import {useQuery} from '@tanstack/react-query';
import {CDN_URL} from '@utils/api/constants';
import type {
  EnsembleChunk,
  EnsembleGeometry,
  EnsembleIndex,
  EnsembleJoint,
  EnsembleJointIndex,
  EnsembleSegment,
  EnsembleSummary,
} from './ensembleTypes';

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
 * 100) are loaded only once the modal is open. The joint-pair index is a few
 * KB and loads with the modal; a pair's counts file loads only once that pair
 * is chosen. A chunk of sampled plans (≈100 KB gzipped, mostly assignments)
 * and the unit geometry (≈60 KB gzipped) load once the individual-plans
 * section asks for them.
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

/**
 * A path the package lists for a file, resolved against the preset folder: a
 * path with a folder in it is relative to the preset, a bare file name sits in
 * `folder`, and an absent one falls back to `fallback` (preset-relative).
 */
export const resolvePresetPath = (
  listed: string | undefined,
  folder: string,
  fallback: string
): string => {
  if (!listed) return fallback;
  const path = listed.replace(/^\.?\//, '');
  return path.includes('/') ? path : `${folder}/${path}`;
};

const presetFileUrl = (moduleSlug: string, preset: string, path: string) =>
  `${ensembleBase(moduleSlug)}/${preset}/${path}`;

export const ensembleChunkUrl = (moduleSlug: string, preset: string, chunk: number) =>
  presetFileUrl(moduleSlug, preset, `chunks/${chunk}.json`);

export const ensembleGeometryUrl = (moduleSlug: string, preset: string) =>
  presetFileUrl(moduleSlug, preset, 'geometry.json');

export const ensembleJointIndexUrl = (moduleSlug: string, preset: string) =>
  presetFileUrl(moduleSlug, preset, 'joint/index.json');

export const ensembleJointUrl = (
  moduleSlug: string,
  preset: string,
  pair: {id: string; file?: string}
) =>
  presetFileUrl(moduleSlug, preset, resolvePresetPath(pair.file, 'joint', `joint/${pair.id}.json`));

/** Shared by every reader of the package, so the panel and the modal fetch each
 * file once between them. */
export const ensembleQueryKeys = {
  index: (moduleSlug: string) => ['ensemble', 'index', moduleSlug] as const,
  summary: (moduleSlug: string, preset: string) =>
    ['ensemble', 'summary', moduleSlug, preset] as const,
  segment: (moduleSlug: string, preset: string) =>
    ['ensemble', 'segment', moduleSlug, preset] as const,
  jointIndex: (moduleSlug: string, preset: string) =>
    ['ensemble', 'joint-index', moduleSlug, preset] as const,
  joint: (moduleSlug: string, preset: string, pairId: string) =>
    ['ensemble', 'joint', moduleSlug, preset, pairId] as const,
  chunk: (moduleSlug: string, preset: string, chunk: number) =>
    ['ensemble', 'chunk', moduleSlug, preset, chunk] as const,
  geometry: (moduleSlug: string, preset: string) =>
    ['ensemble', 'geometry', moduleSlug, preset] as const,
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return (await response.json()) as T;
};

/** An optional file of the package: absent (404, or 403 from the bucket) reads
 * as null, so the modal shows what it shows without it. */
const fetchOptionalJson = async <T>(url: string): Promise<T | null> => {
  const response = await fetch(url);
  if (response.status === 404 || response.status === 403) return null;
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

export const fetchEnsembleJointIndex = (moduleSlug: string, preset: string) =>
  fetchOptionalJson<EnsembleJointIndex>(ensembleJointIndexUrl(moduleSlug, preset));

export const fetchEnsembleJoint = (
  moduleSlug: string,
  preset: string,
  pair: {id: string; file?: string}
) => fetchOptionalJson<EnsembleJoint>(ensembleJointUrl(moduleSlug, preset, pair));

export const fetchEnsembleChunk = (moduleSlug: string, preset: string, chunk: number) =>
  fetchJson<EnsembleChunk>(ensembleChunkUrl(moduleSlug, preset, chunk));

export const fetchEnsembleGeometry = (moduleSlug: string, preset: string) =>
  fetchOptionalJson<EnsembleGeometry>(ensembleGeometryUrl(moduleSlug, preset));

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

/** Optional files resolve to null when absent; a failed read stays an error
 * the caller renders as nothing, and is retried once like the rest. */
export const useEnsembleJointIndex = (moduleSlug?: string, preset?: string, enabled = true) =>
  useQuery({
    queryKey: ensembleQueryKeys.jointIndex(moduleSlug ?? '', preset ?? ''),
    queryFn: () => fetchEnsembleJointIndex(moduleSlug!, preset!),
    enabled: enabled && !!moduleSlug && !!preset,
    ...STATIC_QUERY_OPTIONS,
  });

export const useEnsembleJoint = (
  moduleSlug?: string,
  preset?: string,
  pair?: {id: string; file?: string} | null,
  enabled = true
) =>
  useQuery({
    queryKey: ensembleQueryKeys.joint(moduleSlug ?? '', preset ?? '', pair?.id ?? ''),
    queryFn: () => fetchEnsembleJoint(moduleSlug!, preset!, pair!),
    enabled: enabled && !!moduleSlug && !!preset && !!pair,
    ...STATIC_QUERY_OPTIONS,
  });

/** `chunk` null fetches nothing. A chunk is immutable, so every chunk the
 * reader has drawn stays cached for the session. */
export const useEnsembleChunk = (
  moduleSlug?: string,
  preset?: string,
  chunk?: number | null,
  enabled = true
) =>
  useQuery({
    queryKey: ensembleQueryKeys.chunk(moduleSlug ?? '', preset ?? '', chunk ?? -1),
    queryFn: () => fetchEnsembleChunk(moduleSlug!, preset!, chunk!),
    enabled: enabled && !!moduleSlug && !!preset && chunk !== null && chunk !== undefined,
    ...STATIC_QUERY_OPTIONS,
  });

export const useEnsembleGeometry = (moduleSlug?: string, preset?: string, enabled = true) =>
  useQuery({
    queryKey: ensembleQueryKeys.geometry(moduleSlug ?? '', preset ?? ''),
    queryFn: () => fetchEnsembleGeometry(moduleSlug!, preset!),
    enabled: enabled && !!moduleSlug && !!preset,
    ...STATIC_QUERY_OPTIONS,
  });
