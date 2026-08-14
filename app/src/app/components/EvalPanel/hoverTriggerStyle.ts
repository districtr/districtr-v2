import type {CSSProperties} from 'react';

/** Shared base for an inline, underlined-dotted hover trigger that reads as plain
 * text until hovered — used by BasicsSection (district-highlight triggers) and
 * PartisanSection (FTV HelpTip and table-highlight triggers). Each caller layers
 * its own `cursor`/`fontWeight`/wrap overrides on top for its own use case. */
export const HOVER_TRIGGER_BASE_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  textDecoration: 'underline dotted',
};
