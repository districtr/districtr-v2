'use client';
import React, {useEffect, useMemo, useRef, useState} from 'react';
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

/** Delay (ms) before help opens on hover — the default for every trigger. */
export const HELP_TIP_HOVER_DELAY = 1250;

/** No delay: for a handful of dense, text-only stats explainers (e.g. ideal
 * population, top-to-bottom deviation) where the icon itself is the only thing
 * being hovered — there's no risk of a pass-through hover on the way to
 * clicking something else, so it should feel as immediate as a plain tooltip. */
export const HELP_TIP_FAST_DELAY = 0;

/** The video modal, split out of `HelpTip` so a caller that needs its own trigger
 * for the video (rather than the in-card link) can still reuse it directly. */
export const HelpTipVideoDialog: React.FC<{
  tip: HelpTipKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({tip, open, onOpenChange}) => {
  const entry: HelpTipEntry = helpTipContent[tip];
  // Memoized on `entry` (stable per `tip` — a property lookup on the static
  // helpTipContent dictionary, not a fresh object each render), not on the derived
  // `videoFiles`/`videoUrls` arrays themselves: those are rebuilt fresh on every
  // render regardless of whether `tip` changed, and LoopVideoPlayer treats a new
  // array reference as a new video list — resetting playback to clip 1 — even
  // when a totally unrelated ancestor re-render (e.g. autosave's status flip)
  // is what actually triggered this render.
  const videoUrls = useMemo(() => {
    const videoFiles = entry.videoFiles ?? (entry.videoFile ? [entry.videoFile] : []);
    return videoFiles.map(
      file => `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/videos/guide-2026/${file}`
    );
  }, [entry]);
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
 * component (its own pointerenter-started timer, cancelled by pointerleave), with
 * Radix's internal open timer disabled via a huge openDelay — that timer can't be
 * cancelled from outside, so it would otherwise fire stale opens after the pointer
 * has already left (help popping open with no pointer event left to ever close
 * it). CLOSING stays Radix's: its closeDelay grace period lets the cursor travel
 * from the trigger into the card, and only actually leaving both — not clicking —
 * closes the card, so a click that does real work (selecting a tool, opening a
 * dropdown item) doesn't fight the hover that got the user there.
 */
export const HelpTip: React.FC<{
  tip: HelpTipKey;
  /** Custom hover trigger — wraps this element instead of rendering the default info
   * icon. Used where a dedicated icon would be one affordance too many and the control
   * HelpTip is explaining can just BE the trigger (e.g. a toolbar button, a lock icon). */
  children?: React.ReactNode;
  /** Hover delay before opening — see `HELP_TIP_HOVER_DELAY`. */
  openDelay?: number;
  /** Replaces `helpTipContent[tip].text` for callers whose explanation depends on live
   * state (e.g. SaveButton's "unsaved changes" vs "all changes saved") — the dictionary
   * entry still supplies title/video/guideAnchor, just not the hover text itself. An
   * override doesn't by itself hide the demonstration link (e.g. Undo/Redo's Super Draw
   * shortcut text supplements the same video, it isn't a different situation) — use
   * `hideLink` for overrides that genuinely aren't about the entry's own video. */
  text?: string;
  /** Suppresses the demonstration link even though a video exists — for a `text`
   * override that describes a different situation than the entry's own demo (e.g.
   * County Brush's "unavailable while breaking a unit into blocks"). */
  hideLink?: boolean;
  /** Which side of the trigger the card opens on — Radix's own default (bottom) unless
   * overridden. Also disables Popper's auto-flip-on-collision: a caller that asks for
   * a specific side wants that side, not to have it silently overridden. */
  side?: 'top' | 'right' | 'bottom' | 'left';
}> = ({tip, children, openDelay = HELP_TIP_HOVER_DELAY, text, hideLink, side}) => {
  const [open, setOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const openTimerRef = useRef<number | undefined>(undefined);
  // Where along the trigger's own edge the pointer actually is, in pixels from
  // that edge's start — read directly into `alignOffset` below so the card
  // anchors near the cursor instead of always at the trigger's start corner.
  // Barely visible on a small icon trigger (little room for the offset to
  // differ from 0), but on a wide one (e.g. a full-row accordion header) a
  // fixed `align="start"` anchors the card at the far edge regardless of where
  // along the row you actually hovered — this tracks that instead. A ref, not
  // state: mutating it doesn't need its own re-render, since the timeout below
  // already re-renders (via setOpen) once open actually happens, picking up
  // whatever value was last recorded by then.
  const pointerOffsetRef = useRef(0);
  // alignOffset's axis is perpendicular to `side` — horizontal when the card
  // opens above/below (the default), vertical when it opens beside a narrow
  // column (side="right", e.g. Super Draw's row inside the Mode switcher).
  const trackPointerOffset = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerOffsetRef.current =
      side === 'left' || side === 'right' ? event.clientY - rect.top : event.clientX - rect.left;
  };

  const cancelOpenTimer = () => window.clearTimeout(openTimerRef.current);
  const handlePointerEnter = (event: React.PointerEvent) => {
    trackPointerOffset(event);
    cancelOpenTimer();
    openTimerRef.current = window.setTimeout(() => setOpen(true), openDelay);
  };
  const handlePointerLeave = () => cancelOpenTimer();
  useEffect(() => cancelOpenTimer, []);

  // Widened to the interface: `helpTipContent`'s `satisfies` (see helpTipContent.ts)
  // preserves each entry's own literal shape for HelpTipKey's sake, so indexing by a
  // union key otherwise yields a union of mismatched per-entry shapes.
  const entry: HelpTipEntry = helpTipContent[tip];
  const displayText = text ?? entry.text;
  const videoFiles = entry.videoFiles ?? (entry.videoFile ? [entry.videoFile] : []);
  // Link visibility is independent of whether `text` is overridden — an override
  // can supplement the entry's own video (Undo/Redo's Super Draw shortcut lines)
  // just as easily as it can describe an unrelated situation (County Brush's
  // "unavailable while breaking a unit"); callers in the latter case pass
  // `hideLink` explicitly instead of relying on `text` alone to imply it.
  const canExpand = videoFiles.length > 0 && !hideLink;

  // Handlers are cloned directly onto the trigger element, never a wrapping span:
  // HoverCard's Popper positions the card against this element's own measured rect,
  // and a wrapper (even `display: contents`, which has no box) becomes the measured
  // node instead, anchoring the card at a zero-size rect at the document origin.
  type TriggerProps = {
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerMove?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
  };
  const trigger = children ? (
    React.cloneElement(children as React.ReactElement<TriggerProps>, {
      onPointerEnter: (event: React.PointerEvent) => {
        handlePointerEnter(event);
        (children as React.ReactElement<TriggerProps>).props.onPointerEnter?.(event);
      },
      // Keeps the tracked offset current if the pointer drifts along a wide
      // trigger during the open delay, so it opens near wherever the cursor
      // ended up, not just where it first entered.
      onPointerMove: (event: React.PointerEvent) => {
        trackPointerOffset(event);
        (children as React.ReactElement<TriggerProps>).props.onPointerMove?.(event);
      },
      onPointerLeave: (event: React.PointerEvent) => {
        handlePointerLeave();
        (children as React.ReactElement<TriggerProps>).props.onPointerLeave?.(event);
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
      aria-label={entry.title}
      onPointerEnter={handlePointerEnter}
      onPointerMove={trackPointerOffset}
      onPointerLeave={handlePointerLeave}
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
      <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={NEVER_MS} closeDelay={300}>
        <HoverCard.Trigger>{trigger}</HoverCard.Trigger>
        <HoverCard.Content
          style={{width: COLLAPSED_WIDTH}}
          align="start"
          alignOffset={pointerOffsetRef.current}
          side={side}
          avoidCollisions={!side}
          // Radix's own DismissableLayer, wrapping Content, dismisses on any
          // pointerdown outside Content's DOM by default — and the trigger is a
          // separate portaled element, so clicking it counts as "outside" and
          // closes the card that same click just reopened. Opening/closing here is
          // fully owned by our own pointerenter/pointerleave timers — a click
          // should never dismiss help on its own, only the pointer actually
          // leaving both the trigger and the card does — so this default adds an
          // unwanted second dismissal path on top of that.
          onPointerDownOutside={event => event.preventDefault()}
        >
          <Flex direction="column" gapY="2">
            {/* whiteSpace: 'pre-line' so a caller (e.g. Undo/Redo's shortcut
                lines) can put each sentence on its own line via `\n` in the
                override text — plain `Text` collapses newlines otherwise.
                Omitted entirely when there's no text to show (e.g. the tool-
                group combos, whose hover card is the link itself, no separate
                description above it). */}
            {displayText && (
              <Text size="2" style={{whiteSpace: 'pre-line'}}>
                {displayText}
              </Text>
            )}
            {canExpand && (
              <Text size="2">
                <Link
                  size="2"
                  href="#"
                  onClick={event => {
                    event.preventDefault();
                    setVideoOpen(true);
                  }}
                >
                  Quick demonstration ▸
                </Link>
                {entry.linkSuffix && ` ${entry.linkSuffix}`}
              </Text>
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
