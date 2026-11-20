/**
 * Hold Space to move the map under any tool, as in Figma or Photoshop. The
 * held state is a module flag rather than store state: the map mouse handlers
 * read it on every mousemove, and holding Space leaves the active tool (and
 * everything subscribed to it) untouched.
 */
let spacePanHeld = false;
export const isSpacePanHeld = () => spacePanHeld;
export const setSpacePanHeld = (held: boolean) => {
  spacePanHeld = held;
};

/**
 * Where keyboard focus sits when Space goes down:
 * - `editable`: Space types a character.
 * - `overlay`: inside an open dialog, popover, menu, or listbox, which owns Space.
 * - `neutral`: nothing (body), the map canvas, or a toolbar tool button left
 *   focused by a click — Space there would only scroll the page or re-click
 *   the tool just picked.
 * - `keyboard`: a control reached with Tab. Space is its activation key (the
 *   only one a checkbox or switch has), so it stays native.
 * - `other`: any other control left focused by a click; Space activates it
 *   natively unless the pointer has gone back to the map.
 */
export type SpaceFocusKind = 'editable' | 'overlay' | 'neutral' | 'keyboard' | 'other';

type FocusTarget = {
  tagName: string;
  isContentEditable?: boolean;
  closest: (selectors: string) => unknown;
};

export const classifySpaceFocus = (
  el: FocusTarget | null,
  focusedByKeyboard = false
): SpaceFocusKind => {
  if (!el || el.tagName === 'BODY' || el.tagName === 'HTML') return 'neutral';
  if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
    return 'editable';
  }
  if (el.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) {
    return 'overlay';
  }
  if (el.closest('.maplibregl-map')) return 'neutral';
  if (focusedByKeyboard) return 'keyboard';
  if (el.closest('.tool-button')) return 'neutral';
  return 'other';
};

/**
 * Space starts a pan only when it can't mean anything else: never while
 * typing, inside an overlay, on a control reached by keyboard, or chorded
 * with Ctrl/Meta/Alt; otherwise when the pointer is over the map or focus is
 * neutral.
 */
export const shouldStartSpacePan = (
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  focus: SpaceFocusKind,
  pointerOverMap: boolean
) => {
  if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (focus === 'editable' || focus === 'overlay' || focus === 'keyboard') return false;
  return focus === 'neutral' || pointerOverMap;
};

/**
 * A paint/erase mousedown with none of the plan's units under the brush
 * (ocean, a neighboring state) pans instead. Block view keeps painting: its
 * camera is confined to the broken unit.
 */
export const startsOutsidePlanArea = (unitsUnderBrush: number, inBlockView: boolean) =>
  !inBlockView && unitsUnderBrush === 0;
