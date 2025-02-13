import { create } from "zustand";

export const useDevStore = create((
  set: (state: any) => void,
) => ({
  queryTime: {},
  addQueryTime: (
    nFeatures: number,
    time: number
  ) => {
    set({
      queryTime: {
        feautres: nFeatures,
        time: time
      }
    })
  },
  clear: () => set({queryTimes: [] }),
  useRtree: true,
  toggleUse: () => {
    set((state: any) => ({useRtree: !state.useRtree, queryTimes: []}))
  }
}));