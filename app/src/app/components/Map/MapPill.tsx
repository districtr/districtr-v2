'use client';
import React, {useEffect} from 'react';
import {Button, Flex, Text} from '@radix-ui/themes';

interface MapPillProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: {label: string; onClick: () => void};
  // Extra inline content between the label and the action button — e.g. a
  // checkbox for a setting that's directly relevant to this pill's flow.
  extra?: React.ReactNode;
  // Fires on Escape whenever this pill is mounted; omit for pills with no
  // exit/cancel behavior of their own.
  onEscape?: () => void;
  testId?: string;
}

/**
 * Shared shell for the bottom-center map pills (break flow, paint-mask
 * flow): accent ring, strong shadow, slide-up entrance (see .map-pill in
 * globals.css), optional action button, and Escape-to-act — guarded so
 * Escape aimed at a focused field (e.g. closing the geocoder dropdown)
 * doesn't also trigger it.
 */
export const MapPill: React.FC<MapPillProps> = ({
  icon,
  children,
  action,
  extra,
  onEscape,
  testId,
}) => {
  useEffect(() => {
    if (!onEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      onEscape();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onEscape]);

  return (
    <Flex align="center" gap="3" px="4" py="3" className="map-pill" data-testid={testId}>
      {icon}
      <Text size="3">{children}</Text>
      {extra}
      {action && (
        <Button size="2" variant="solid" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </Flex>
  );
};
