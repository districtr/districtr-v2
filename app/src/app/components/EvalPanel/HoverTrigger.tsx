import type {CSSProperties, ReactNode} from 'react';

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

interface HoverTriggerProps {
  onEnter: () => void;
  onLeave: () => void;
  bold?: boolean;
  children: ReactNode;
}

/** Inline text that highlights something elsewhere (map districts, table
 * cells) while hovered or focused. */
export const HoverTrigger: React.FC<HoverTriggerProps> = ({onEnter, onLeave, bold, children}) => (
  <button
    type="button"
    style={bold ? {...HOVER_BTN_STYLE, fontWeight: 'bold'} : HOVER_BTN_STYLE}
    {...hoverHandlers(onEnter, onLeave)}
  >
    {children}
  </button>
);
