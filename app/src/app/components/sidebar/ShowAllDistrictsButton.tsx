'use client';
import React from 'react';
import {Button} from '@radix-ui/themes';

/** Toggle under district tables that default to started-districts-only.
 * Renders nothing when every district is already visible. */
export const ShowAllDistrictsButton: React.FC<{
  showAll: boolean;
  onToggle: () => void;
  total: number;
  hiddenCount: number;
}> = ({showAll, onToggle, total, hiddenCount}) =>
  hiddenCount > 0 ? (
    <Button
      variant="ghost"
      size="1"
      onClick={onToggle}
      style={{alignSelf: 'start', fontWeight: 600}}
      mx="1"
      my="1"
    >
      {showAll ? 'Show only started districts' : `Show all ${total} districts`}
    </Button>
  ) : null;
