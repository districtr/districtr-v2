'use client';
import React from 'react';
import {Toolbar} from './Toolbar';
import {VisualSettingsPopover} from './VisualSettingsPopover';
import {useIsDesktop} from '@/app/hooks/useIsDesktop';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

/**
 * Bottom tool dock for viewports below lg, where the sidebar (and the toolbar
 * inside it) is hidden. Renders the same Toolbar as the desktop sidebar —
 * ToolButtons pinned to the bottom edge, tool controls (brush size, district
 * picker) expanding above them — plus the Visual settings popover. The JS gate
 * (not just CSS) guarantees only one Toolbar instance is ever mounted, since
 * its subtree registers document-level hotkey listeners. Toolbar itself
 * returns null when not editing.
 */
export const MobileToolbar: React.FC = () => {
  const isDesktop = useIsDesktop();
  const isEval = useMapControlsStore(state => state.isEval);
  if (isDesktop || isEval) return null;
  return (
    <div className="lg:hidden flex flex-col-reverse flex-none bg-white border-t border-gray-500 max-h-[50dvh] overflow-y-auto">
      <Toolbar />
      {/* col-reverse: this row sits above the tool buttons/controls. */}
      <div className="flex justify-start px-2 py-1 border-b border-gray-200">
        <VisualSettingsPopover />
      </div>
    </div>
  );
};
