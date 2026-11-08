import {CDN_URL} from '@utils/api/constants';
import {sanitizeEntries} from './diagRegistry';
import type {
  DiagModuleIndex,
  DiagPresetIndex,
  DiagRange,
  DiagRegistryEntry,
} from './diagTypes';

const diagUrl = (folder: string, path: string) => `${CDN_URL}/ensembles-diag/${folder}/${path}`;

/** Folder holding a preset's files: the alias target when `package` is set. */
export const diagFolder = (module: string, preset?: {package?: string}) =>
  preset?.package ?? module;

/**
 * The module's `index.json` or null when none exists (404/403 is a normal
 * state). Shape `{module_slug, presets: [{key, label, default, n_plans,
 * generated_at, package?}]}`.
 */
export const getDiagModuleIndex = async (module: string): Promise<DiagModuleIndex | null> => {
  const response = await fetch(diagUrl(module, 'index.json'));
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Diag index for ${module}: ${response.status}`);
  return (await response.json()) as DiagModuleIndex;
};

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
};

export const getDiagPresetIndex = (folder: string, preset: string) =>
  getJson<DiagPresetIndex>(diagUrl(folder, `${preset}/index.json`));

export const getDiagNodes = (folder: string, preset: string) =>
  getJson<string[]>(diagUrl(folder, `${preset}/nodes.json`));

/** Range files are large; one fetch per file for the page's lifetime. */
const rangeCache = new Map<string, Promise<DiagRange>>();
export const getDiagRange = (folder: string, preset: string, k: number): Promise<DiagRange> => {
  const url = diagUrl(folder, `${preset}/steps/${k}.json`);
  let p = rangeCache.get(url);
  if (!p) {
    p = getJson<DiagRange>(url);
    p.catch(() => rangeCache.delete(url));
    rangeCache.set(url, p);
  }
  return p;
};

/** The module-level CDN seed registry; a missing file counts as empty. */
export const getDiagSeedRegistry = async (folder: string): Promise<DiagRegistryEntry[]> => {
  const response = await fetch(diagUrl(folder, 'registry.json'));
  if (!response.ok) return [];
  const data = await response.json();
  return sanitizeEntries(data);
};
