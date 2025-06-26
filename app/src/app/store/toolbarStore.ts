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
  toolbarWidth: number;
  setToolbarWidth: (width: number) => void;
  toolbarHeight: number;
  setToolbarHeight: (height: number) => void;
};
const [MIN_X, MIN_Y] = [-14, 26];
const SNAP_THRESHOLD = 60;
const EDGE_SNAP_DISTANCE = 10;
export const useToolbarStore = create(
  persist<ToolbarState>(
    (set, get) => ({
      x: null,
      y: null,
      defaultX: null,
      defaultY: null,
      isMobile: false,
      toolbarLocation: 'sidebar',
      setToolbarLocation: toolbarLocation => set({toolbarLocation}),
      setIsMobile: isMobile => set({isMobile}),
      rotation: 'horizontal',
      setXY: (_x, _y, rectify) => {
        const state = get();
        const {maxX, maxY} = state.maxXY;
        const {toolbarWidth, toolbarHeight} = state;

        // Check if toolbar should move to sidebar
        if (maxX && _x > maxX + toolbarWidth) {
          set({toolbarLocation: 'sidebar'});
          return;
        }

        let x = _x;
        let y = _y;
        let newRotation = state.rotation;

        if (rectify && maxX && maxY) {
          // Edge snapping logic
          const snapToLeft = _x < SNAP_THRESHOLD;
          const snapToRight = _x > maxX - SNAP_THRESHOLD;
          const snapToTop = _y < SNAP_THRESHOLD;
          const snapToBottom = _y > maxY - SNAP_THRESHOLD;

          // Snap to edges
          if (snapToLeft) {
            x = MIN_X;
          } else if (snapToRight) {
            x = maxX;
          }

          if (snapToTop) {
            y = MIN_Y;
          } else if (snapToBottom) {
            y = maxY;
          }

          // Auto-rotation logic when hitting edges
          const isMiddleX = _x > maxX * 0.2 && _x < maxX * 0.8;
          const isMiddleY = _y > maxY * 0.2 && _y < maxY * 0.8;

          // Rotate to horizontal when hitting top/bottom edges
          if (snapToTop || snapToBottom) {
            newRotation = 'horizontal';
          }
          // Rotate to vertical when hitting left/right edges
          else if (snapToLeft || snapToRight) {
            newRotation = 'vertical';
          }
          // Additional rotation for middle positions
          else if ((snapToTop || snapToBottom) && isMiddleX) {
            newRotation = 'horizontal';
          } else if ((snapToLeft || snapToRight) && isMiddleY) {
            newRotation = 'vertical';
          }

          // Constrain within bounds
          console.log('x', x, 'min_x', MIN_X, 'maxX', maxX);
          x = Math.min(Math.max(x, MIN_X), maxX);
          y = Math.min(Math.max(y, MIN_Y), maxY);
        }

        set({
          x,
          y,
          rotation: newRotation,
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
      toolbarWidth: 0,
      setToolbarWidth: width => set({toolbarWidth: width}),
      toolbarHeight: 0,
      setToolbarHeight: height => set({toolbarHeight: height}),
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
