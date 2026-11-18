import {create} from 'zustand';
import {persist, subscribeWithSelector} from 'zustand/middleware';
import {DocumentObject} from '@utils/api/apiHandlers/types';
import {MAP_TYPES} from '@constants/document/types';
import {getSiteSettings, useSiteSettings} from '@utils/api/siteSettings';

/** CMS-toggled features (Frontend settings → Feature flags) and their defaults:
 * on, so a flag the CMS leaves out, or a site-settings fetch that hasn't landed
 * yet, leaves the feature as it shipped. Off hides the feature's entry point
 * and leaves its state at the default. */
// Adding one? Also list it in the CMS help text
// (cms/moderation/templates/moderation/site_settings.html).
export const DEFAULT_FEATURE_FLAGS = {
  /** Dismissible pills for active map layers under the palette. */
  activeMapPills: true,
  /** Focusing districts in Super Draw's population meters. */
  districtFocus: true,
  /** Super Draw's "Tuning view" button. */
  tuningView: true,
  /** "Reorder districts" in Map actions, which renumbers the plan's districts. */
  reorderDistricts: true,
  /** Renaming districts: the meters' click-to-rename and the description
   * popover's label field. Off, saved labels still show. */
  districtLabels: true,
};
export type FeatureFlag = keyof typeof DEFAULT_FEATURE_FLAGS;
type FlagOverrides = Partial<Record<FeatureFlag, boolean>>;

interface FeatureFlagStore {
  boundarySettings: boolean;
  paintCounties: boolean;
  formUrl: string | null;
  debugSelectionPoints: boolean;
  gotFlags: boolean;
  updateData: (mapDocument: DocumentObject | null) => void;
  getFlags: () => Promise<void>;
  /** Per-browser overrides of the CMS flags, kept in localStorage; set from
   * the console with `featureFlags.set(...)`. */
  overrides: FlagOverrides;
  setOverrides: (overrides: FlagOverrides) => void;
}

export const useFeatureFlagStore = create<FeatureFlagStore>()(
  persist(
    subscribeWithSelector((set, get) => ({
      boundarySettings: true,
      paintCounties: true,
      formUrl: null,
      debugSelectionPoints: false,
      gotFlags: false,
      getFlags: async () => {
        if (get().gotFlags) return;
        const response = await fetch('/api/env').then(res => res.json());
        set({
          formUrl: response.formUrl,
          debugSelectionPoints: response.debugSelectionPoints,
          gotFlags: true,
        });
      },
      updateData: (mapDocument: DocumentObject | null) => {
        if (!mapDocument) return;
        if (mapDocument.map_type === MAP_TYPES.LOCAL) {
          set({
            boundarySettings: false,
            paintCounties: false,
          });
        }
      },
      overrides: {},
      setOverrides: overrides => set({overrides}),
    })),
    {
      name: 'districtr-feature-flags',
      partialize: state => ({overrides: state.overrides}),
      // The default merge would copy any stored key over the store (formUrl
      // included); take only the overrides, and only well-formed ones.
      merge: (persisted, current) => ({
        ...current,
        overrides: cleanOverrides((persisted as {overrides?: unknown} | undefined)?.overrides),
      }),
    }
  )
);

/** Known flags with boolean values only; anything else is dropped. */
export function cleanOverrides(value: unknown): FlagOverrides {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([flag, on]) => flag in DEFAULT_FEATURE_FLAGS && typeof on === 'boolean'
    )
  );
}

/** Override, else the CMS's value, else the default. */
export const resolveFlag = (
  flag: FeatureFlag,
  override: boolean | undefined,
  cms: Record<string, boolean> | undefined
) => override ?? cms?.[flag] ?? DEFAULT_FEATURE_FLAGS[flag];

/** Whether a CMS-toggled feature is on. The CMS values ride the shared
 * site-settings poll, so open tabs follow a change within about a minute.
 * Not to be confused with hooks/useFeatureFlags, which returns the /api/env
 * settings. */
export const useFeatureFlag = (flag: FeatureFlag) =>
  resolveFlag(
    flag,
    useFeatureFlagStore(state => state.overrides[flag]),
    useSiteSettings()?.feature_flags
  );

// Console: featureFlags.set({tuningView: false}) overrides, .set({tuningView:
// undefined}) drops one, .reset() drops all, .current shows what's in effect.
if (typeof window !== 'undefined') {
  const {getState} = useFeatureFlagStore;
  window.featureFlags = {
    set: flags => getState().setOverrides({...getState().overrides, ...flags}),
    reset: () => getState().setOverrides({}),
    get current() {
      const cms = getSiteSettings()?.feature_flags;
      return Object.fromEntries(
        (Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlag[]).map(flag => [
          flag,
          resolveFlag(flag, getState().overrides[flag], cms),
        ])
      ) as Record<FeatureFlag, boolean>;
    },
  };
}

declare global {
  interface Window {
    featureFlags?: {
      set: (flags: FlagOverrides) => void;
      reset: () => void;
      readonly current: Record<FeatureFlag, boolean>;
    };
  }
}
