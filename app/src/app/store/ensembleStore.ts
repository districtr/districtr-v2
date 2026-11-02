import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import type {EnsembleMetricRef} from '@utils/ensembleStats';

/**
 * Reader-facing state of the evaluation panel's ensemble layer: which preset a
 * reader compares against, and whether the "About these plans" modal is open.
 *
 * The preset is kept per module slug and persisted, so a reader who prefers the
 * county-aware chain keeps it across visits while a different module still
 * opens on its own default. The modal is session state and stays out of storage.
 */
interface EnsembleStore {
  presetByModule: Record<string, string>;
  setPreset: (moduleSlug: string, presetKey: string) => void;
  modalOpen: boolean;
  /** The metric the modal opens on; null opens it on its own default. */
  modalMetric: EnsembleMetricRef | null;
  openModal: (metric?: EnsembleMetricRef | null) => void;
  setModalOpen: (open: boolean) => void;
}

export const useEnsembleStore = create<EnsembleStore>()(
  persist(
    set => ({
      presetByModule: {},
      setPreset: (moduleSlug, presetKey) =>
        set(state => ({presetByModule: {...state.presetByModule, [moduleSlug]: presetKey}})),
      modalOpen: false,
      modalMetric: null,
      openModal: (metric = null) => set({modalOpen: true, modalMetric: metric}),
      setModalOpen: open => set({modalOpen: open}),
    }),
    {
      name: 'ensemble-reference',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: state => ({presetByModule: state.presetByModule}),
    }
  )
);
