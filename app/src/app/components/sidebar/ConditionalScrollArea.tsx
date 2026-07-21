import React from 'react';
import {ScrollArea} from '@radix-ui/themes';

// Radix's overlay scrollbar (see the `type="always"` note below) reserves no
// gutter of its own — it renders on top of the viewport's right edge. This
// padding gives it a dead zone to sit in instead of overlapping the
// rightmost column's data, and doubles as breathing room between this inner
// scrollbar and the sidebar's own outer scrollbar (DataCards/Sidebar), which
// otherwise sit close enough together that grabbing the outer one means
// first scrolling the inner list all the way to its end.
const SCROLLBAR_GUTTER = '1rem';

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
        style={{maxHeight}}
      >
        <div style={{paddingRight: SCROLLBAR_GUTTER, boxSizing: 'border-box', width: '100%'}}>
          {children}
        </div>
      </ScrollArea>
    );
  }
  return children;
};
