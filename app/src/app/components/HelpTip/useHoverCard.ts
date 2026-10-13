'use client';
import React, {useEffect, useRef, useState} from 'react';

/**
 * Opening and alignment for a Radix HoverCard whose card holds text a reader
 * may want to select and copy. Shared by every hover card in the evaluation
 * surface so the subtleties below are stated once.
 *
 * Responsibility is split with Radix: OPENING is owned here, by a timer started
 * on pointerenter and cancelled on pointerleave, with Radix's own open timer
 * benched via `openDelay: NEVER_MS` — that timer can't be cancelled from
 * outside, so it would otherwise fire stale opens after the pointer has already
 * left, leaving a card open with no pointer event left to ever close it.
 * CLOSING stays Radix's: its `closeDelay` is the grace period for moving the
 * cursor from the trigger into the card, and it deliberately holds the card open
 * while text inside it is selected, so copying isn't interrupted mid-drag.
 *
 * That selection guard has no expiry, though — after a selection, Radix's own
 * hover-leave close won't fire again until a fresh pointerdown inside the card.
 * `onPointerDownOutside` is the escape hatch: any outside click dismisses the
 * card, except a click back on the trigger itself, which is portaled separately
 * and would otherwise count as outside and re-close the card that same click
 * just opened.
 */

/** Effectively "never": Radix's own open timer can't meaningfully fire. */
export const NEVER_MS = 2 ** 30;

/** Grace period for the cursor to travel from the trigger into the card. */
export const HOVER_CARD_CLOSE_DELAY = 300;

export interface HoverCardTriggerProps {
  onPointerEnter: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerLeave: () => void;
}

export interface HoverCardState {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Put on the trigger element itself, never on a wrapper: Popper measures it. */
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  triggerProps: HoverCardTriggerProps;
  /** Anchors the card near the cursor rather than at the trigger's start corner. */
  alignOffset: number;
  onPointerDownOutside: (event: {
    detail: {originalEvent: {target: EventTarget | null}};
    preventDefault: () => void;
  }) => void;
}

/**
 * `side` is the side the card opens on, and sets the axis `alignOffset` runs
 * along: perpendicular to the card's own side, so horizontal above or below the
 * trigger and vertical beside it.
 */
export const useHoverCard = (
  openDelay: number,
  side?: 'top' | 'right' | 'bottom' | 'left'
): HoverCardState => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<number | undefined>(undefined);
  // Where along the trigger's edge the pointer is, in pixels from that edge's
  // start. A ref, not state: the open itself re-renders, picking up whatever
  // value was last recorded by then.
  const pointerOffsetRef = useRef(0);

  const trackPointerOffset = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointerOffsetRef.current =
      side === 'left' || side === 'right' ? event.clientY - rect.top : event.clientX - rect.left;
  };
  const cancelOpenTimer = () => window.clearTimeout(openTimerRef.current);
  useEffect(() => cancelOpenTimer, []);

  return {
    open,
    setOpen,
    triggerRef,
    alignOffset: pointerOffsetRef.current,
    triggerProps: {
      onPointerEnter: (event: React.PointerEvent) => {
        trackPointerOffset(event);
        cancelOpenTimer();
        openTimerRef.current = window.setTimeout(() => setOpen(true), openDelay);
      },
      // Keeps the offset current if the pointer drifts along a wide trigger
      // during the delay, so the card opens near wherever the cursor ended up.
      onPointerMove: trackPointerOffset,
      onPointerLeave: cancelOpenTimer,
    },
    onPointerDownOutside: event => {
      const target = event.detail.originalEvent.target as Node | null;
      if (target && triggerRef.current?.contains(target)) {
        event.preventDefault();
      }
    },
  };
};
