import {create} from 'zustand';
import {persist} from 'zustand/middleware';

export type ToolbarState = {
  x: number | null;
  y: number | null;
  defaultX: number | null;
  defaultY: number | null;
  rotation: 'horizontal' | 'vertical' | null;
  setXY: (x: number, y: number, rectify?: boolean) => void;
  setDefaultXY: (x: number, y: number) => void;
  maxXY: {maxX: number | null; maxY: number | null};
  setRotation: (rotation: 'horizontal' | 'vertical' | null) => void;
  setMaxXY: (maxX: number, maxY: number) => void;
  toolbarSize: number;
  setToolbarSize: (size: ToolbarState['toolbarSize']) => void;
  customizeToolbar: boolean;
  setCustomzieToolbar: (customize: boolean) => void;
  isMobile: boolean;
  setIsMobile: (isMobile: boolean) => void;
  toolbarLocation: 'map' | 'sidebar';
  setToolbarLocation: (location: 'map' | 'sidebar') => void;
};
const [MIN_X, MIN_Y] = [-14, 26];
export const useToolbarStore = create(
  persist<ToolbarState>(
    (set, get) => ({
      x: null,
      y: null,
      defaultX: null,
      defaultY: null,
      isMobile: false,
      toolbarLocation: 'map',
      setToolbarLocation: toolbarLocation => set({toolbarLocation}),
      setIsMobile: isMobile => set({isMobile}),
      rotation: 'horizontal',
      setXY: (_x, _y, rectify) => {
        const {maxX, maxY} = get().maxXY;
        if (maxX && _x > maxX) {
          return;
        }
        const x = rectify ? Math.min(Math.max(_x, MIN_X), maxX || Math.pow(2, 16)) : _x;
        const y = rectify ? Math.min(Math.max(_y, MIN_Y), maxY || Math.pow(2, 16)) : _y;
        set({
          x,
          y,
        });
      },
      setDefaultXY: (x, y) => {
        set({
          defaultX: x,
          defaultY: y,
        });
      },
      setRotation: rotation => set({rotation}),
      maxXY: {maxX: null, maxY: null},
      setMaxXY: (maxX, maxY) => {
        set({
          maxXY: {maxX, maxY},
          x: Math.max(Math.min(get().x || MIN_X, maxX), 0),
          y: Math.max(Math.min(get().y || MIN_Y, maxY), 0),
        });
      },
      toolbarSize: 40,
      setToolbarSize: size => set({toolbarSize: size}),
      customizeToolbar: false,
      setCustomzieToolbar: customize => set({customizeToolbar: customize}),
    }),
    {
      name: 'toolbarStore',
      // @ts-ignore
      partialize: state => ({
        x: state.x,
        y: state.y,
        rotation: state.rotation,
        toolbarSize: state.toolbarSize,
        customizeToolbar: state.customizeToolbar,
        toolbarLocation: state.toolbarLocation,
      }),
    }
  )
);
