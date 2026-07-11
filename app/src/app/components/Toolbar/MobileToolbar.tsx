'use client';
import React from 'react';
import {Toolbar} from './Toolbar';
import {useIsDesktop} from '@/app/hooks/useIsDesktop';

/**
 * Bottom tool dock for viewports below lg, where the sidebar (and the toolbar
 * inside it) is hidden. Renders the same Toolbar as the desktop sidebar —
 * ToolButtons pinned to the bottom edge, tool controls (brush size, district
 * picker) expanding above them. The JS gate (not just CSS) guarantees only one
 * Toolbar instance is ever mounted, since its subtree registers document-level
 * hotkey listeners. Toolbar itself returns null when not editing.
 */
export const MobileToolbar: React.FC = () => {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;
  return (
    <div className="lg:hidden flex flex-col-reverse flex-none bg-white border-t border-gray-500 max-h-[50dvh] overflow-y-auto">
      <Toolbar />
    </div>
  );
};
