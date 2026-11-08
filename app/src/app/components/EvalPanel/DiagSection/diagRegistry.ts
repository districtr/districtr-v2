import type {DiagRegistryEntry} from './diagTypes';

/** Minimal Storage surface, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const registryStorageKey = (module: string) => `districtr-diag-registry:${module}`;

export const entryId = (e: Pick<DiagRegistryEntry, 'preset' | 'step'>) => `${e.preset}#${e.step}`;

/** Registry entries only ever carry these fields; anything else (a document UUID, say) is dropped. */
const clean = (raw: unknown): DiagRegistryEntry | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.preset !== 'string' || typeof r.step !== 'number') return null;
  if (typeof r.public_id !== 'number') return null;
  return {
    preset: r.preset,
    step: r.step,
    public_id: r.public_id,
    note: typeof r.note === 'string' ? r.note : '',
    when: typeof r.when === 'string' ? r.when : '',
  };
};

export const sanitizeEntries = (arr: unknown): DiagRegistryEntry[] =>
  Array.isArray(arr) ? arr.map(clean).filter((e): e is DiagRegistryEntry => !!e) : [];

export const parseRegistry = (json: string | null): DiagRegistryEntry[] => {
  if (!json) return [];
  try {
    return sanitizeEntries(JSON.parse(json));
  } catch {
    return [];
  }
};

export const loadLocalRegistry = (store: KeyValueStore, module: string): DiagRegistryEntry[] =>
  parseRegistry(store.getItem(registryStorageKey(module)));

export const saveLocalRegistry = (
  store: KeyValueStore,
  module: string,
  entries: DiagRegistryEntry[]
) => store.setItem(registryStorageKey(module), JSON.stringify(entries.map(e => clean(e))));

/** Insert or replace by preset + step. */
export const upsertEntry = (
  entries: DiagRegistryEntry[],
  entry: DiagRegistryEntry
): DiagRegistryEntry[] => [...entries.filter(e => entryId(e) !== entryId(entry)), entry];

/**
 * Seed entries from the CDN merged with the browser's, one row per preset +
 * step. The browser's row wins, since it carries the reader's note.
 */
export const mergeRegistries = (
  seed: DiagRegistryEntry[],
  local: DiagRegistryEntry[]
): DiagRegistryEntry[] => {
  const byId = new Map<string, DiagRegistryEntry>();
  for (const e of seed) byId.set(entryId(e), e);
  for (const e of local) byId.set(entryId(e), e);
  return [...byId.values()];
};

/** JSON the "Copy registry" button puts on the clipboard: the browser's rows only. */
export const registryExport = (local: DiagRegistryEntry[]): string =>
  JSON.stringify(
    local.map(e => clean(e)),
    null,
    2
  );
