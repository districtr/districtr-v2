type FocusTarget = {
  tagName: string;
  isContentEditable?: boolean;
  closest: (selectors: string) => unknown;
};

/**
 * Whether a Space keydown holds the Move tool (useSpacePan) rather than doing
 * what Space natively does where focus sits. Never while typing, inside an
 * open dialog, menu or listbox, chorded with Ctrl/Meta/Alt, or on a control
 * reached by keyboard: Space is that control's activation key, the only one a
 * checkbox or switch has. A control left focused by a click gives Space up;
 * otherwise Space would re-click the tool button just picked.
 */
export const spaceHoldsMove = (
  e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>,
  focused: FocusTarget | null,
  focusedByKeyboard: boolean
) => {
  if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (!focused || focused.tagName === 'BODY' || focused.tagName === 'HTML') return true;
  if (focused.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(focused.tagName)) {
    return false;
  }
  if (focused.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) {
    return false;
  }
  if (focused.closest('.maplibregl-map')) return true;
  return !focusedByKeyboard;
};
