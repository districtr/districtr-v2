import React from 'react';
import {ScrollArea} from '@radix-ui/themes';

// Radix's overlay scrollbar (see the `type="always"` note below) renders as a
// sibling of the scrollable viewport, at the ScrollArea's own box edge — not
// as part of the scrolled content. Two separate reservations are needed:
//   1. Padding *inside* the viewport's content, so the scrollbar (which still
//      sits at the ScrollArea's right edge) doesn't overlap the rightmost
//      column's data.
//   2. Shrinking the ScrollArea's own box width, so that edge — and the
//      scrollbar rendered on it — sits inboard of the sidebar's own outer
//      scrollbar (DataCards/Sidebar), leaving a real gap between the two
//      scrollbar tracks. Padding inside the content (1) has no effect on this
//      — it doesn't move the ScrollArea box itself.
const DATA_GUTTER = '0.75rem';
const OUTER_SCROLLBAR_GAP = '0.75rem';

export const ConditionalScrollArea: React.FC<{
  children: React.ReactNode;
  shouldUseScrollableRows: boolean;
  maxHeight: string;
}> = ({children, shouldUseScrollableRows, maxHeight}) => {
  if (shouldUseScrollableRows) {
    return (
      // type="always" keeps the scrollbar visible even while not scrolling — it is the
      // sole affordance that more rows exist below (no fade-out effect).
      <ScrollArea
        scrollbars="vertical"
        type="always"
        size="2"
        className="flex-grow-1"
        style={{maxHeight, width: `calc(100% - ${OUTER_SCROLLBAR_GAP})`}}
      >
        <div style={{paddingRight: DATA_GUTTER, boxSizing: 'border-box', width: '100%'}}>
          {children}
        </div>
      </ScrollArea>
    );
  }
  return children;
};
