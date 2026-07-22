'use client';
import React, {useState} from 'react';
import {Flex, IconButton, Popover, Text, Link} from '@radix-ui/themes';
import {InfoCircledIcon} from '@radix-ui/react-icons';
import {LoopVideoPlayer} from '@/app/components/Static/LoopVideoPlayer';
import {helpTipContent, type HelpTipKey} from './helpTipContent';

const COLLAPSED_WIDTH = 220;
const EXPANDED_WIDTH = 380;

/**
 * Stops the event from reaching a parent that might act on it — required when a HelpTip is
 * nested inside a Radix DropdownMenu.Item, so clicking the help icon doesn't also fire the
 * item's own onSelect. Harmless (and applied unconditionally) for standalone placements too.
 */
const stopPropagation = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

export const HelpTip: React.FC<{tip: HelpTipKey}> = ({tip}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const entry = helpTipContent[tip];

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset to collapsed so the popover doesn't reopen mid-video next time.
      setIsExpanded(false);
    }
  };

  const videoUrl = entry.videoFile
    ? `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/${entry.videoFile}`
    : undefined;
  const canExpand = !!entry.videoFile || !!entry.guideAnchor;

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger>
        <IconButton
          variant="ghost"
          size="1"
          color="gray"
          mx="1"
          onClick={stopPropagation}
          onPointerDown={stopPropagation}
        >
          <InfoCircledIcon />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content
        style={{width: isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH}}
        align="start"
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
      >
        <Flex direction="column" gapY="2">
          <Text size="2">{entry.text}</Text>
          {!isExpanded && canExpand && (
            <Link
              size="2"
              href="#"
              onClick={event => {
                event.preventDefault();
                setIsExpanded(true);
              }}
            >
              Watch video ▸
            </Link>
          )}
          {isExpanded && (
            <Flex direction="column" gapY="2">
              {videoUrl && <LoopVideoPlayer videoUrl={videoUrl} />}
              {entry.guideAnchor && (
                <Link
                  size="2"
                  href={`/guide#${entry.guideAnchor}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View in guide →
                </Link>
              )}
            </Flex>
          )}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};

export default HelpTip;
