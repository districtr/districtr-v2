'use client';
import React, {useLayoutEffect, useRef, useState} from 'react';
import {Box, Flex, IconButton, HoverCard, Text, Link} from '@radix-ui/themes';
import {InfoCircledIcon} from '@radix-ui/react-icons';
import {LoopVideoPlayer} from '@/app/components/Static/LoopVideoPlayer';
import {helpTipContent, type HelpTipEntry, type HelpTipKey} from './helpTipContent';

const COLLAPSED_WIDTH = 220;
const EXPANDED_WIDTH = 380;
// Leaves a margin so the overlay never touches the viewport edge exactly.
const VIEWPORT_MARGIN = 16;

/**
 * Small hover-triggered help affordance, matching the existing plain-text `InfoTip`'s
 * hover UX (`ideal population`, etc.) but adding an optional "expand" action for a
 * clip and a link to the relevant guide section. Hover-based rather than click-based
 * (unlike a Popover) so it can sit inside a Radix DropdownMenu.Item without its own
 * interaction firing that item's onSelect — hovering never triggers menu selection.
 */
export const HelpTip: React.FC<{
  tip: HelpTipKey;
  /** Overrides the trigger icon's color (a CSS color value, e.g. a Radix `var(--accent-*)`
   * token) — for callers that need it to track another element's state-dependent color
   * (e.g. a toolbar button's selected/unselected foreground) instead of the plain gray
   * default. */
  iconColor?: string;
}> = ({tip, iconColor}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  // Where the expanded overlay opens, and how tall it's allowed to get — measured
  // against the actual viewport (see the effect below), since Radix's own collision
  // avoidance never sees this overlay: it isn't part of HoverCard.Content's own
  // tracked size (that's the whole point — see the comment on HoverCard.Content),
  // so without this it can render extending past the bottom (or top) of the screen
  // with no way to reach the rest of it.
  const [overlayLayout, setOverlayLayout] = useState<{
    direction: 'down' | 'up';
    maxHeight: number;
    align: 'left' | 'right';
  }>({direction: 'down', maxHeight: Infinity, align: 'left'});

  useLayoutEffect(() => {
    if (!isExpanded || !contentRef.current) return;
    const rect = contentRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const direction = spaceBelow >= spaceAbove ? 'down' : 'up';
    // Same idea horizontally: left-aligning (the overlay's left edge at the
    // collapsed card's left edge, growing rightward) is the default, but near
    // the right edge of the viewport that runs the fixed-width overlay off
    // screen, so flip to right-aligned (anchored to the card's right edge,
    // growing leftward) when there isn't enough room to the right.
    const spaceRight = window.innerWidth - rect.left - VIEWPORT_MARGIN;
    const align = spaceRight >= EXPANDED_WIDTH ? 'left' : 'right';
    setOverlayLayout({direction, maxHeight: Math.max(spaceBelow, spaceAbove), align});
  }, [isExpanded]);

  // Widened to the interface: `helpTipContent`'s `satisfies` (see helpTipContent.ts)
  // preserves each entry's own literal shape for HelpTipKey's sake, so indexing by a
  // union key otherwise yields a union of mismatched per-entry shapes.
  const entry: HelpTipEntry = helpTipContent[tip];
  const videoFiles = entry.videoFiles ?? (entry.videoFile ? [entry.videoFile] : []);
  const videoUrls = videoFiles.map(
    file => `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/${file}`
  );
  const canExpand = videoUrls.length > 0 || !!entry.guideAnchor;

  return (
    <HoverCard.Root onOpenChange={open => !open && setIsExpanded(false)}>
      <HoverCard.Trigger>
        <IconButton
          variant="ghost"
          size="1"
          color={iconColor ? undefined : 'gray'}
          mx="1"
          className="cursor-help"
          style={iconColor ? {color: iconColor} : undefined}
        >
          <InfoCircledIcon />
        </IconButton>
      </HoverCard.Trigger>
      {/* Kept at a fixed (collapsed) size regardless of isExpanded — Radix repositions
          this box whenever its measured size changes, and growing it to fit a video
          moved the whole card away from wherever the cursor still was, reading as the
          pointer leaving and closing it. The expanded content instead renders as an
          absolutely-positioned overlay below (see the Box after this), which doesn't
          affect this element's own measured size, so Radix never repositions it and
          the original (collapsed) footprint stays fully inside the visible card. */}
      {/* !overflow-visible overrides Radix's own `.rt-HoverCardContent { overflow: auto }`
          (confirmed in its source) — without it the absolutely-positioned expansion Box
          below is clipped the instant it crosses this container's edge, invisibly. Uses
          Tailwind's !important form rather than an inline style: an inline `style` prop
          here gets merged with Radix's own generated style object, and it wasn't clear
          which one wins, so this avoids that ambiguity outright. */}
      <HoverCard.Content
        ref={contentRef}
        className="!overflow-visible"
        style={{width: COLLAPSED_WIDTH, position: 'relative'}}
        align="start"
      >
        <Flex direction="column" gapY="2">
          <Text size="2">{entry.text}</Text>
          {/* invisible, not unmounted, once expanded: keeps this box's own measured
              height exactly constant (see the comment on HoverCard.Content above). */}
          {canExpand && (
            <Link
              size="2"
              href="#"
              className={isExpanded ? 'invisible' : undefined}
              tabIndex={isExpanded ? -1 : undefined}
              onClick={event => {
                event.preventDefault();
                setIsExpanded(true);
              }}
            >
              {videoUrls.length > 0 ? 'Watch video ▸' : 'Learn more ▸'}
            </Link>
          )}
        </Flex>
        {isExpanded && (
          <Box
            className={`absolute overflow-y-auto rounded-md border border-gray-200 bg-white p-3 shadow-lg ${
              overlayLayout.direction === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'
            } ${overlayLayout.align === 'left' ? 'left-0' : 'right-0'}`}
            style={{width: EXPANDED_WIDTH, maxHeight: overlayLayout.maxHeight}}
          >
            <Flex direction="column" gapY="2">
              {/* One player, not one-per-clip: LoopVideoPlayer cycles through the array
                  in sequence (video 1 -> video 2 -> ... -> back to 1) when there's more
                  than one, rather than showing every clip stacked at once. */}
              {videoUrls.length > 0 && <LoopVideoPlayer videoUrl={videoUrls} />}
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
          </Box>
        )}
      </HoverCard.Content>
    </HoverCard.Root>
  );
};

export default HelpTip;
