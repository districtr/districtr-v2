'use client';
import React, {useEffect, useState} from 'react';
import {Box, Button, Flex} from '@radix-ui/themes';
import {ChevronDownIcon} from '@radix-ui/react-icons';

// One constant drives both the CSS transition and the delayed unmount so the
// two can't drift apart.
const COLLAPSE_DURATION_MS = 200;

/** Shared height-collapse for the sidebar's section headers and expanders.
 * CSS grid-rows transition; children unmount once the close animation ends so
 * collapsed panels don't keep rendering or subscribing. */
export const AnimatedCollapse: React.FC<{open: boolean; children: React.ReactNode}> = ({
  open,
  children,
}) => {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timeout = setTimeout(() => setMounted(false), COLLAPSE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [open]);
  return (
    <div
      className="grid transition-[grid-template-rows] ease-out"
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        transitionDuration: `${COLLAPSE_DURATION_MS}ms`,
      }}
    >
      <div className="min-h-0 overflow-hidden">{mounted ? children : null}</div>
    </div>
  );
};

/** Collapsible sub-section with a full-width button header — the "Create a
 * coalition" pattern, shared by the stacked panels' Table / Map Layer
 * expanders. */
export const Expander: React.FC<{
  label: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode: pass both to own the open state (e.g. so UI hints can
   * open a specific expander). Omit both for internal state. */
  open?: boolean;
  onToggle?: () => void;
  /** Extra classes for the header button (e.g. h-auto for multi-line labels). */
  buttonClassName?: string;
  /** Extra classes for the outer container. Pulse-highlight classes go here:
   * the header's !bg-transparent and the container's overflow-hidden defeat
   * the animation on the button itself. */
  className?: string;
  children: React.ReactNode;
}> = ({
  label,
  defaultOpen = false,
  open,
  onToggle,
  buttonClassName = '',
  className = '',
  children,
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const toggle = onToggle ?? (() => setUncontrolledOpen(o => !o));
  // One bordered container around header + content so the pair reads as a
  // unit; the header is a flat soft bar (its own surface border would double
  // up inside the outline).
  return (
    <Flex
      direction="column"
      className={`rounded-md border border-[var(--gray-6)] overflow-hidden ${className}`}
    >
      <Button
        variant="soft"
        color="gray"
        size="2"
        onClick={toggle}
        aria-expanded={isOpen}
        className={`w-full cursor-pointer rounded-none !bg-transparent hover:!bg-[var(--gray-a3)] ${buttonClassName}`}
      >
        <Flex align="center" justify="between" width="100%">
          {label}
          <ChevronDownIcon
            className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
          />
        </Flex>
      </Button>
      <AnimatedCollapse open={isOpen}>
        <Box p="2">{children}</Box>
      </AnimatedCollapse>
    </Flex>
  );
};
