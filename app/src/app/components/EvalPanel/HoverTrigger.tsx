import type {CSSProperties, ReactNode} from 'react';
import {useIsReport} from './evalMode';

/** Shared inline, underlined-dotted hover trigger style. `fontWeight`/wrap
 * behavior are layered on top per usage — a trigger naming a specific result
 * value reads bold, one introducing or explaining a concept doesn't. */
export const HOVER_BTN_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  cursor: 'default',
  textDecoration: 'underline dotted',
};

/** The four handlers a hoverable element needs so the highlight it drives
 * follows keyboard focus as well as the pointer. Spread onto any element. */
export const hoverHandlers = (onEnter: () => void, onLeave: () => void) => ({
  onMouseEnter: onEnter,
  onMouseLeave: onLeave,
  onFocus: onEnter,
  onBlur: onLeave,
});

type HoverHandlers = ReturnType<typeof hoverHandlers>;
const noHandlers = (): Partial<HoverHandlers> => ({});

/**
 * `hoverHandlers` for the view the caller renders in. The report gets none: its
 * map figure is a still image, and nothing on the page may change the map behind it.
 */
export const useHoverHandlers = (): ((
  onEnter: () => void,
  onLeave: () => void
) => Partial<HoverHandlers>) => (useIsReport() ? noHandlers : hoverHandlers);

interface HoverTriggerProps {
  onEnter: () => void;
  onLeave: () => void;
  bold?: boolean;
  children: ReactNode;
}

/** Inline text that highlights something elsewhere (map districts, table
 * cells) while hovered or focused. */
export const HoverTrigger: React.FC<HoverTriggerProps> = ({onEnter, onLeave, bold, children}) => {
  const isReport = useIsReport();
  // The report has nothing to highlight: the trigger is running text there.
  if (isReport) return bold ? <strong>{children}</strong> : <>{children}</>;
  return (
    <button
      type="button"
      style={bold ? {...HOVER_BTN_STYLE, fontWeight: 'bold'} : HOVER_BTN_STYLE}
      {...hoverHandlers(onEnter, onLeave)}
    >
      {children}
    </button>
  );
};
