import React from 'react';
import {ScrollArea} from '@radix-ui/themes';

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
        {children}
      </ScrollArea>
    );
  }
  return children;
};
