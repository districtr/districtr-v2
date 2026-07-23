'use client';
import React from 'react';
import {Toolbar} from './Toolbar';
import {PaintDetails} from './ToolControls/PaintDetails';
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
      {/* col-reverse: these sit above the tool buttons/controls. The sidebar's
          scroll area doesn't exist below lg, so the dock hosts PaintDetails. */}
      <div className="px-2 py-1">
        <PaintDetails />
      </div>
      <div className="flex justify-start px-2 py-1 border-b border-gray-200">
        <VisualSettingsPopover />
      </div>
    </div>
  );
};
