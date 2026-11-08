import {CDN_URL} from '@utils/api/constants';
import {sanitizeEntries} from './diagRegistry';
import type {
  DiagModuleIndex,
  DiagPresetIndex,
  DiagRange,
  DiagRegistryEntry,
} from './diagTypes';

const diagUrl = (module: string, path: string) => `${CDN_URL}/ensembles-diag/${module}/${path}`;

/**
 * The module's `index.json` or null when none exists (404/403 is a normal
 * state). Assumed shape `{module, presets: [{key, path}]}`; this is the one
 * place to adapt if the published shape differs.
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

export const getDiagPresetIndex = (module: string, presetPath: string) =>
  getJson<DiagPresetIndex>(diagUrl(module, `${presetPath}/index.json`));

export const getDiagNodes = (module: string, presetPath: string) =>
  getJson<string[]>(diagUrl(module, `${presetPath}/nodes.json`));

/** Range files are large; one fetch per file for the page's lifetime. */
const rangeCache = new Map<string, Promise<DiagRange>>();
export const getDiagRange = (module: string, presetPath: string, k: number): Promise<DiagRange> => {
  const url = diagUrl(module, `${presetPath}/steps/${k}.json`);
  let p = rangeCache.get(url);
  if (!p) {
    p = getJson<DiagRange>(url);
    p.catch(() => rangeCache.delete(url));
    rangeCache.set(url, p);
  }
  return p;
};

/** The CDN seed registry; a missing file counts as empty. */
export const getDiagSeedRegistry = async (
  module: string,
  presetPath: string
): Promise<DiagRegistryEntry[]> => {
  const response = await fetch(diagUrl(module, `${presetPath}/registry.json`));
  if (!response.ok) return [];
  const data = await response.json();
  return sanitizeEntries(data);
};
