import type {CSSProperties, FocusEvent, ReactNode} from 'react';
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

/**
 * A soft chip: the look of an element that exists only to be hovered, such as
 * "highlight these districts". Inline text that also carries a tooltip keeps the
 * dotted underline of HOVER_BTN_STYLE.
 */
export const HOVER_CHIP_CLASS =
  'cursor-default rounded-[var(--radius-2)] border-0 bg-[var(--accent-a3)] px-1.5 py-0.5 ' +
  'text-[var(--accent-a11)] hover:bg-[var(--accent-a5)] focus-visible:bg-[var(--accent-a5)]';

/** The four handlers a hoverable element needs so the highlight it drives
 * follows keyboard focus as well as the pointer. Spread onto any element.
 * Only focus from the keyboard counts: a click also gives focus, and the browser
 * returns that focus with the window, where no pointer holds the highlight. */
export const hoverHandlers = (onEnter: () => void, onLeave: () => void) => ({
  onMouseEnter: onEnter,
  onMouseLeave: onLeave,
  onFocus: (event: FocusEvent) => {
    if (event.target.matches(':focus-visible')) onEnter();
  },
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
  /** A soft chip in place of underlined text, for a trigger that stands alone. */
  chip?: boolean;
  children: ReactNode;
}

/** Inline text that highlights something elsewhere (map districts, table
 * cells) while hovered or focused. */
export const HoverTrigger: React.FC<HoverTriggerProps> = ({
  onEnter,
  onLeave,
  bold,
  chip,
  children,
}) => {
  const isReport = useIsReport();
  // The report has nothing to highlight: the trigger is running text there.
  if (isReport) return bold ? <strong>{children}</strong> : <>{children}</>;
  if (chip) {
    return (
      <button
        type="button"
        className={HOVER_CHIP_CLASS}
        style={{font: 'inherit', fontWeight: bold ? 'bold' : undefined}}
        {...hoverHandlers(onEnter, onLeave)}
      >
        {children}
      </button>
    );
  }
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
