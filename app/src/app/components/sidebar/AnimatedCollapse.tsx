'use client';
import React, {useEffect, useState} from 'react';
import {Button, Flex} from '@radix-ui/themes';
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
  children: React.ReactNode;
}> = ({label, defaultOpen = false, open, onToggle, buttonClassName = '', children}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const toggle = onToggle ?? (() => setUncontrolledOpen(o => !o));
  return (
    <Flex direction="column" gap="2">
      <Button
        variant="surface"
        color="gray"
        size="2"
        onClick={toggle}
        aria-expanded={isOpen}
        className={`w-full cursor-pointer ${buttonClassName}`}
      >
        <Flex align="center" justify="between" width="100%">
          {label}
          <ChevronDownIcon
            className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
          />
        </Flex>
      </Button>
      <AnimatedCollapse open={isOpen}>{children}</AnimatedCollapse>
    </Flex>
  );
};
