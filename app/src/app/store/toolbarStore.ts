import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ToolbarState = {
  x: number | null;
  y: number | null;
  rotation: 'horizontal' | 'vertical' | null;
  setXY: (x: number, y: number) => void;
  maxXY: {maxX: number | null; maxY: number | null};
  setRotation: (rotation: 'horizontal' | 'vertical' | null) => void;
  setMaxXY: (maxX: number, maxY: number) => void;
};

export const useToolbarStore = create(
  persist<ToolbarState>(
    (set, get) => ({
      x: null,
      y: null,
      rotation: 'horizontal',
      setXY: (_x, _y) => {
        const {maxX, maxY} = get().maxXY;
        const x = Math.min(Math.max(_x, 0), maxX || Math.pow(2, 16));
        const y = Math.min(Math.max(_y, 0), maxY || Math.pow(2, 16));
        set({
          x,
          y,
        });
      },
      setRotation: rotation => set({rotation}),
      maxXY: {maxX: null, maxY: null},
      setMaxXY: (maxX, maxY) => {
        set({
          maxXY: {maxX, maxY},
          x: Math.max(Math.min(get().x || 0, maxX), 0),
          y: Math.max(Math.min(get().y || 0, maxY), 0),
        });
      },
    }),
    {
      name: 'toolbarStore',
    }
  )
);
