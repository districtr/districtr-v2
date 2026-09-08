import type {CSSProperties} from 'react';

/** Shared inline, underlined-dotted hover trigger style, used by BasicsSection
 * (district-highlight triggers) and PartisanSection (FTV HelpTip and
 * table-highlight triggers). `fontWeight`/wrap behavior are layered on top per
 * usage — a trigger naming a specific result value reads bold, one introducing
 * or explaining a concept doesn't. */
export const HOVER_BTN_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  cursor: 'default',
  textDecoration: 'underline dotted',
};
