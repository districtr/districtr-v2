'use client';
import React, {useMemo, useState} from 'react';
import dynamic from 'next/dynamic';
import {Box, Button, Dialog, Flex, HoverCard, Link, Text} from '@radix-ui/themes';
import {InfoCircledIcon} from '@radix-ui/react-icons';
import {helpTipContent, type HelpTipEntry, type HelpTipKey} from './helpTipContent';
import {HOVER_CARD_CLOSE_DELAY, NEVER_MS, useHoverCard} from './useHoverCard';

// Code-split: most hovers never reach "Watch video", so the player (and the video
// bytes themselves, loaded lazily inside it) shouldn't be in everyone's initial bundle.
const LoopVideoPlayer = dynamic(
  () => import('@/app/components/Static/LoopVideoPlayer').then(mod => mod.LoopVideoPlayer),
  {ssr: false}
);

const COLLAPSED_WIDTH = 220;
const VIDEO_MODAL_MAX_WIDTH = 720;

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

/** Calls every ref with the same node, so cloning an element for `ref` doesn't
 * clobber a ref the caller already put on it (same purpose as Radix's own
 * `composeRefs`, used internally by `Slot`). */
function mergeRefs<T>(...refs: (React.Ref<T> | null | undefined)[]): React.RefCallback<T> {
  return node => {
    refs.forEach(ref => {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
    });
  };
}

/**
 * Small hover-triggered help affordance: short text, optionally a "Watch video" link
 * opening a full-window modal with the clip and a guide link. Opening, alignment and
 * outside-click dismissal come from `useHoverCard`.
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
  const [videoOpen, setVideoOpen] = useState(false);
  const {open, setOpen, triggerRef, triggerProps, alignOffset, onPointerDownOutside} =
    useHoverCard(openDelay, side);

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
    ref?: React.Ref<HTMLElement>;
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerMove?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
  };
  // `cloneElement`'s `ref` in its config replaces the child's own ref outright
  // (it isn't merged like other props) — read the child's original ref first
  // so mergeRefs can preserve it instead of silently dropping it.
  const childRef = children
    ? (children as unknown as {ref?: React.Ref<HTMLElement>}).ref
    : undefined;
  const trigger = children ? (
    React.cloneElement(children as React.ReactElement<TriggerProps>, {
      ref: mergeRefs(triggerRef, childRef),
      onPointerEnter: (event: React.PointerEvent) => {
        triggerProps.onPointerEnter(event);
        (children as React.ReactElement<TriggerProps>).props.onPointerEnter?.(event);
      },
      // Keeps the tracked offset current if the pointer drifts along a wide
      // trigger during the open delay, so it opens near wherever the cursor
      // ended up, not just where it first entered.
      onPointerMove: (event: React.PointerEvent) => {
        triggerProps.onPointerMove(event);
        (children as React.ReactElement<TriggerProps>).props.onPointerMove?.(event);
      },
      onPointerLeave: (event: React.PointerEvent) => {
        triggerProps.onPointerLeave();
        (children as React.ReactElement<TriggerProps>).props.onPointerLeave?.(event);
      },
    })
  ) : (
    // A plain span, not IconButton: ghost IconButton pads itself and cancels that
    // with negative margins, which can leave it internally taller than the text
    // line it sits in. A fixed 16px flex box matches size="1" Text's line-height
    // exactly, so it can never make its row taller than the text beside it.
    <span
      ref={triggerRef as React.Ref<HTMLSpanElement>}
      role="button"
      tabIndex={0}
      aria-label={entry.title}
      {...triggerProps}
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
      {/* openDelay={NEVER_MS} deliberately benches Radix's own open path — see
          useHoverCard. */}
      <HoverCard.Root
        open={open}
        onOpenChange={setOpen}
        openDelay={NEVER_MS}
        closeDelay={HOVER_CARD_CLOSE_DELAY}
      >
        <HoverCard.Trigger>{trigger}</HoverCard.Trigger>
        <HoverCard.Content
          style={{width: COLLAPSED_WIDTH}}
          align="start"
          alignOffset={alignOffset}
          side={side}
          avoidCollisions={!side}
          onPointerDownOutside={onPointerDownOutside}
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
