'use client';
import React, {useState} from 'react';
import {Button, Dialog} from '@radix-ui/themes';
import {Toolbar} from './Toolbar';
import {VisualSettingsPopover} from './VisualSettingsPopover';
import {
  DraftStatusHelper,
  useDraftStatusHelperVisible,
} from '@components/sidebar/DraftStatusHelper';
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
 *
 * The draft-status helper doesn't render inline here — it would eat most of
 * the dock's height. Instead a "View map guide" button opens it in a modal,
 * which closes itself when a hint navigates elsewhere.
 */
export const MobileToolbar: React.FC = () => {
  const isDesktop = useIsDesktop();
  const isEval = useMapControlsStore(state => state.isEval);
  const helperVisible = useDraftStatusHelperVisible();
  const [guideOpen, setGuideOpen] = useState(false);
  if (isDesktop || isEval) return null;
  return (
    <div className="lg:hidden flex flex-col-reverse flex-none bg-white border-t border-gray-500 max-h-[50dvh] overflow-y-auto">
      <Toolbar />
      {/* col-reverse: this row sits above the tool buttons/controls. */}
      <div className="flex justify-between items-center px-2 py-1 border-b border-gray-200">
        <VisualSettingsPopover />
        {helperVisible && (
          <Button variant="outline" size="1" onClick={() => setGuideOpen(true)}>
            View map guide
          </Button>
        )}
      </div>
      <Dialog.Root open={guideOpen} onOpenChange={setGuideOpen}>
        <Dialog.Content size="1" maxWidth="400px">
          <Dialog.Title className="sr-only">Map guide</Dialog.Title>
          <DraftStatusHelper onNavigate={() => setGuideOpen(false)} collapsible={false} />
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
};
