import {expect, test} from 'bun:test';
import {spaceHoldsMove} from './spacePan';

// Minimal stand-in for an Element: `closest` matches when any of the
// selector's comma-separated parts names one of the element's ancestors.
const el = (tagName: string, ancestors: string[] = [], isContentEditable = false) => ({
  tagName,
  isContentEditable,
  closest: (selectors: string) =>
    selectors.split(',').some(s => ancestors.includes(s.trim())) ? {} : null,
});
const space = {code: 'Space', ctrlKey: false, metaKey: false, altKey: false};

test('Space holds Move when nothing, the map, or a clicked control has focus', () => {
  expect(spaceHoldsMove(space, null, false)).toBe(true);
  expect(spaceHoldsMove(space, el('BODY'), false)).toBe(true);
  expect(spaceHoldsMove(space, el('CANVAS', ['.maplibregl-map']), true)).toBe(true);
  // The tool button just clicked: Space must not re-click it.
  expect(spaceHoldsMove(space, el('BUTTON'), false)).toBe(true);
});

test('typing, overlays and keyboard-reached controls keep Space', () => {
  expect(spaceHoldsMove(space, el('INPUT'), false)).toBe(false);
  expect(spaceHoldsMove(space, el('TEXTAREA'), false)).toBe(false);
  expect(spaceHoldsMove(space, el('SELECT'), false)).toBe(false);
  expect(spaceHoldsMove(space, el('DIV', [], true), false)).toBe(false);
  expect(spaceHoldsMove(space, el('BUTTON', ['[role="dialog"]']), false)).toBe(false);
  expect(spaceHoldsMove(space, el('DIV', ['[role="menu"]']), false)).toBe(false);
  expect(spaceHoldsMove(space, el('BUTTON'), true)).toBe(false);
});

test('modifier chords and other keys never do', () => {
  expect(spaceHoldsMove({...space, ctrlKey: true}, null, false)).toBe(false);
  expect(spaceHoldsMove({...space, metaKey: true}, null, false)).toBe(false);
  expect(spaceHoldsMove({...space, altKey: true}, null, false)).toBe(false);
  expect(spaceHoldsMove({...space, code: 'KeyP'}, null, false)).toBe(false);
});
