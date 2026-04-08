import React from 'react';
import {ScrollArea} from '@radix-ui/themes';

export const ConditionalScrollArea: React.FC<{
  children: React.ReactNode;
  shouldUseScrollableRows: boolean;
  maxHeight: string;
}> = ({children, shouldUseScrollableRows, maxHeight}) => {
  if (shouldUseScrollableRows) {
    return (
      <ScrollArea
        scrollbars="vertical"
        className="flex-grow-1"
        style={{maxHeight}}
      >
        {children}
      </ScrollArea>
    );
  }
  return children;
};
