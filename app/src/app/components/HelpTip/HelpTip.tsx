'use client';
import React, {useEffect, useRef, useState} from 'react';
import dynamic from 'next/dynamic';
import {Box, Button, Dialog, Flex, HoverCard, Link, Text} from '@radix-ui/themes';
import {InfoCircledIcon} from '@radix-ui/react-icons';
import {helpTipContent, type HelpTipEntry, type HelpTipKey} from './helpTipContent';

// Code-split: most hovers never reach "Watch video", so the player (and the video
// bytes themselves, loaded lazily inside it) shouldn't be in everyone's initial bundle.
const LoopVideoPlayer = dynamic(
  () => import('@/app/components/Static/LoopVideoPlayer').then(mod => mod.LoopVideoPlayer),
  {ssr: false}
);

const COLLAPSED_WIDTH = 220;
const VIDEO_MODAL_MAX_WIDTH = 720;

// Effectively "never": passed as Radix's own openDelay so its internal open timer
// can't meaningfully fire. Opening is driven entirely by this component's own timer
// (see HelpTip), because Radix's timer can't be cancelled from outside — it survives
// clicks, and a controlled `open` prop doesn't clear it.
const NEVER_MS = 2 ** 30;

/** Delay (ms) before help opens on a whole-element trigger someone frequently
 * clicks to do their actual work (a toolbar tool, a lock toggle, a mode switch) —
 * long enough that a quick pass-through hover on the way to clicking doesn't pop
 * help open and get in the way. */
export const HELP_TIP_HOVER_DELAY = 1000;

/** Delay (ms) for triggers that are mostly *read*, not clicked for frequent,
 * repeated work — a stats figure, a panel's own explainer icon, an occasional
 * settings/edit button. These should feel as immediate as plain tooltips. */
export const HELP_TIP_FAST_DELAY = 150;

/** The video modal, split out of `HelpTip` so a caller that needs its own trigger
 * for the video (rather than the in-card link) can still reuse it directly. */
export const HelpTipVideoDialog: React.FC<{
  tip: HelpTipKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({tip, open, onOpenChange}) => {
  const entry: HelpTipEntry = helpTipContent[tip];
  const videoFiles = entry.videoFiles ?? (entry.videoFile ? [entry.videoFile] : []);
  const videoUrls = videoFiles.map(
    file => `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/${file}`
  );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{maxWidth: VIDEO_MODAL_MAX_WIDTH}}>
        <Dialog.Title>{entry.title}</Dialog.Title>
        <Dialog.Description size="2" color="gray">
          {entry.text}
        </Dialog.Description>
        <Flex direction="column" gap="3" mt="3">
          {/* One player, not one-per-clip: LoopVideoPlayer cycles through the array in
              sequence (video 1 -> video 2 -> ... -> back to 1) when there's more than
              one, rather than showing every clip stacked at once. */}
          {videoUrls.length > 0 && <LoopVideoPlayer videoUrl={videoUrls} />}
          <Flex direction="row" gap="2" justify="between" className="mt-2">
            {entry.guideAnchor ? (
              <Button asChild variant="soft" size="3">
                <a href={`/guide#${entry.guideAnchor}`} target="_blank" rel="noopener noreferrer">
                  View in guide
                </a>
              </Button>
            ) : (
              <Box />
            )}
            <Button variant="soft" size="3" color="gray" onClick={() => onOpenChange(false)}>
              Return to map
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

/**
 * Small hover-triggered help affordance: short text, optionally a "Watch video" link
 * opening a full-window modal with the clip and a guide link.
 *
 * Responsibility is split with Radix's HoverCard: OPENING is owned entirely by this
 * component (its own pointerenter-started timer, cancelled by pointerleave or any
 * click), with Radix's internal open timer disabled via a huge openDelay — that
 * timer can't be cancelled from outside, so it would otherwise fire stale opens
 * after a click (help popping over an open dropdown menu, or mid-paint, with no
 * pointer event left to ever close it). CLOSING stays Radix's: its closeDelay grace
 * period lets the cursor travel from the trigger into the card, and a late close is
 * self-correcting where a late open is not.
 */
export const HelpTip: React.FC<{
  tip: HelpTipKey;
  /** Custom hover trigger — wraps this element instead of rendering the default info
   * icon. Used where a dedicated icon would be one affordance too many and the control
   * HelpTip is explaining can just BE the trigger (e.g. a toolbar button, a lock icon). */
  children?: React.ReactNode;
  /** Hover delay before opening — see `HELP_TIP_HOVER_DELAY` / `HELP_TIP_FAST_DELAY`. */
  openDelay?: number;
  /** Replaces `helpTipContent[tip].text` for callers whose explanation depends on live
   * state (e.g. SaveButton's "unsaved changes" vs "all changes saved") — the dictionary
   * entry still supplies title/video/guideAnchor, just not the hover text itself. */
  text?: string;
  /** Which side of the trigger the card opens on — Radix's own default (bottom) unless
   * overridden. Also disables Popper's auto-flip-on-collision: a caller that asks for
   * a specific side wants that side, not to have it silently overridden. */
  side?: 'top' | 'right' | 'bottom' | 'left';
}> = ({tip, children, openDelay = HELP_TIP_HOVER_DELAY, text, side}) => {
  const [open, setOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const openTimerRef = useRef<number | undefined>(undefined);

  const cancelOpenTimer = () => window.clearTimeout(openTimerRef.current);
  const handlePointerEnter = () => {
    cancelOpenTimer();
    openTimerRef.current = window.setTimeout(() => setOpen(true), openDelay);
  };
  const handlePointerLeave = () => cancelOpenTimer();
  // Any click on the trigger kills help outright: cancels a pending open (so it
  // can't fire later, after the user has moved on to whatever the click did) and
  // closes an already-open card.
  const handleClick = () => {
    cancelOpenTimer();
    setOpen(false);
  };
  useEffect(() => cancelOpenTimer, []);

  // Widened to the interface: `helpTipContent`'s `satisfies` (see helpTipContent.ts)
  // preserves each entry's own literal shape for HelpTipKey's sake, so indexing by a
  // union key otherwise yields a union of mismatched per-entry shapes.
  const entry: HelpTipEntry = helpTipContent[tip];
  const displayText = text ?? entry.text;
  const videoFiles = entry.videoFiles ?? (entry.videoFile ? [entry.videoFile] : []);
  const canExpand = videoFiles.length > 0;

  // Handlers are cloned directly onto the trigger element, never a wrapping span:
  // HoverCard's Popper positions the card against this element's own measured rect,
  // and a wrapper (even `display: contents`, which has no box) becomes the measured
  // node instead, anchoring the card at a zero-size rect at the document origin.
  type TriggerProps = {
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
    onClickCapture?: (e: React.MouseEvent) => void;
  };
  const trigger = children ? (
    React.cloneElement(children as React.ReactElement<TriggerProps>, {
      onPointerEnter: (event: React.PointerEvent) => {
        handlePointerEnter();
        (children as React.ReactElement<TriggerProps>).props.onPointerEnter?.(event);
      },
      onPointerLeave: (event: React.PointerEvent) => {
        handlePointerLeave();
        (children as React.ReactElement<TriggerProps>).props.onPointerLeave?.(event);
      },
      onClickCapture: (event: React.MouseEvent) => {
        handleClick();
        (children as React.ReactElement<TriggerProps>).props.onClickCapture?.(event);
      },
    })
  ) : (
    // A plain span, not IconButton: ghost IconButton pads itself and cancels that
    // with negative margins, which can leave it internally taller than the text
    // line it sits in. A fixed 16px flex box matches size="1" Text's line-height
    // exactly, so it can never make its row taller than the text beside it.
    <span
      role="button"
      tabIndex={0}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClickCapture={handleClick}
      className="cursor-help shrink-0 inline-flex items-center justify-center"
      style={{
        width: 16,
        height: 16,
        color: 'var(--gray-9)',
        // Optical alignment: text's visual weight (baseline + x-height) sits
        // slightly below its geometric center, so a flex-centered icon reads as
        // too high next to it without this nudge.
        transform: 'translateY(1.5px)',
      }}
    >
      <InfoCircledIcon width={14} height={14} />
    </span>
  );

  return (
    <>
      {/* openDelay={NEVER_MS} deliberately benches Radix's own open path — see the
          component doc comment. closeDelay is real: it's the grace period for
          moving the cursor from the trigger into the card. */}
      <HoverCard.Root
        open={open}
        onOpenChange={setOpen}
        openDelay={NEVER_MS}
        closeDelay={300}
      >
        <HoverCard.Trigger>{trigger}</HoverCard.Trigger>
        <HoverCard.Content
          style={{width: COLLAPSED_WIDTH}}
          align="start"
          side={side}
          avoidCollisions={!side}
        >
          <Flex direction="column" gapY="2">
            <Text size="2">{displayText}</Text>
            {canExpand && (
              <Link
                size="2"
                href="#"
                onClick={event => {
                  event.preventDefault();
                  setVideoOpen(true);
                }}
              >
                Watch video ▸
              </Link>
            )}
          </Flex>
        </HoverCard.Content>
      </HoverCard.Root>
      {/* A modal rather than an inline popover expansion: the narrow hover card has
          no room to show a video readably, and growing a Popper-positioned card in
          place makes it reposition and collide with viewport edges. Click-outside-
          to-close is Radix Dialog's default behavior. */}
      {canExpand && <HelpTipVideoDialog tip={tip} open={videoOpen} onOpenChange={setVideoOpen} />}
    </>
  );
};

export default HelpTip;
