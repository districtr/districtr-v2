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
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({label, defaultOpen = false, children}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Flex direction="column" gap="2">
      <Button
        variant="surface"
        color="gray"
        size="2"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full cursor-pointer"
      >
        <Flex align="center" justify="between" width="100%">
          {label}
          <ChevronDownIcon
            className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
          />
        </Flex>
      </Button>
      <AnimatedCollapse open={open}>{children}</AnimatedCollapse>
    </Flex>
  );
};
