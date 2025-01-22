import {create} from 'zustand';
import {persist} from 'zustand/middleware';

export type ToolbarState = {
  x: number | null;
  y: number | null;
  rotation: 'horizontal' | 'vertical' | null;
  setXY: (x: number, y: number, rectify?: boolean) => void;
  maxXY: {maxX: number | null; maxY: number | null};
  setRotation: (rotation: 'horizontal' | 'vertical' | null) => void;
  setMaxXY: (maxX: number, maxY: number) => void;
  toolbarSize:  number;
  setToolbarSize: (size: ToolbarState['toolbarSize']) => void;
};

export const useToolbarStore = create(
  persist<ToolbarState>(
    (set, get) => ({
      x: null,
      y: null,
      rotation: 'horizontal',
      setXY: (_x, _y, rectify) => {
        const {maxX, maxY} = get().maxXY;
        const x = rectify ? Math.min(Math.max(_x, 0), maxX || Math.pow(2, 16)) : _x;
        const y = rectify ? Math.min(Math.max(_y, 32), maxY || Math.pow(2, 16)) : _y;
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
      toolbarSize: 40,
      setToolbarSize: size => set({toolbarSize: size}),
    }),
    {
      name: 'toolbarStore',
    }
  )
);
