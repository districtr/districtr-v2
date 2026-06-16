import {create} from 'zustand';
import {persist} from 'zustand/middleware';

export type ToolbarState = {
  toolbarSize: number;
  setToolbarSize: (size: ToolbarState['toolbarSize']) => void;
};

export const useToolbarStore = create(
  persist<ToolbarState>(
    set => ({
      toolbarSize: 40,
      setToolbarSize: size => set({toolbarSize: size}),
    }),
    {
      name: 'toolbarStore',
      // The toolbar is fixed to the sidebar, so legacy layout state (location, x/y,
      // rotation, dimensions, draggable flag) is gone. Bump the version to drop any
      // previously persisted fields, preserving only the user's toolbar size.
      version: 2,
      // @ts-ignore - legacy persisted state had extra fields
      migrate: persistedState => {
        const prev = (persistedState ?? {}) as Partial<ToolbarState>;
        return {toolbarSize: prev.toolbarSize ?? 40} as ToolbarState;
      },
      // @ts-ignore - persisted state is a partial of ToolbarState
      partialize: state => ({toolbarSize: state.toolbarSize}),
    }
  )
);
