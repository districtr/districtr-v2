'use client';
import React, {useEffect, useState} from 'react';

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
