import {describe, expect, test} from 'bun:test';
import {classifySpaceFocus, shouldStartSpacePan, startsOutsidePlanArea} from './spacePan';

// Minimal stand-in for an Element: `closest` matches when any of the
// selector's comma-separated parts names one of the element's ancestors.
const el = (tagName: string, ancestors: string[] = [], isContentEditable = false) => ({
  tagName,
  isContentEditable,
  closest: (selectors: string) =>
    selectors.split(',').some(s => ancestors.includes(s.trim())) ? {} : null,
});

const space = {code: 'Space', ctrlKey: false, metaKey: false, altKey: false};

describe('classifySpaceFocus', () => {
  test('nothing focused, the map canvas, and tool buttons are neutral', () => {
    expect(classifySpaceFocus(null)).toBe('neutral');
    expect(classifySpaceFocus(el('BODY'))).toBe('neutral');
    expect(classifySpaceFocus(el('CANVAS', ['.maplibregl-map']))).toBe('neutral');
    expect(classifySpaceFocus(el('BUTTON', ['.tool-button']))).toBe('neutral');
  });

  test('text entry is editable', () => {
    expect(classifySpaceFocus(el('INPUT'))).toBe('editable');
    expect(classifySpaceFocus(el('TEXTAREA'))).toBe('editable');
    expect(classifySpaceFocus(el('SELECT'))).toBe('editable');
    expect(classifySpaceFocus(el('DIV', [], true))).toBe('editable');
  });

  test('an open dialog or menu owns focus, even over a tool button', () => {
    expect(classifySpaceFocus(el('BUTTON', ['[role="dialog"]']))).toBe('overlay');
    expect(classifySpaceFocus(el('DIV', ['[role="menu"]']))).toBe('overlay');
    expect(classifySpaceFocus(el('BUTTON', ['[role="dialog"]', '.tool-button']))).toBe('overlay');
  });

  test('any other control is left native', () => {
    expect(classifySpaceFocus(el('BUTTON'))).toBe('other');
  });

  test('a control reached with Tab keeps Space, tool buttons included', () => {
    expect(classifySpaceFocus(el('BUTTON'), true)).toBe('keyboard');
    expect(classifySpaceFocus(el('BUTTON', ['.tool-button']), true)).toBe('keyboard');
    // The map and an empty focus have no use for Space either way.
    expect(classifySpaceFocus(el('CANVAS', ['.maplibregl-map']), true)).toBe('neutral');
    expect(classifySpaceFocus(null, true)).toBe('neutral');
  });
});

describe('shouldStartSpacePan', () => {
  test('neutral focus starts a pan wherever the pointer is', () => {
    expect(shouldStartSpacePan(space, 'neutral', false)).toBe(true);
    expect(shouldStartSpacePan(space, 'neutral', true)).toBe(true);
  });

  test('another focused control keeps Space unless the pointer is over the map', () => {
    expect(shouldStartSpacePan(space, 'other', false)).toBe(false);
    expect(shouldStartSpacePan(space, 'other', true)).toBe(true);
  });

  test('typing, overlays and keyboard-reached controls always keep Space', () => {
    expect(shouldStartSpacePan(space, 'editable', true)).toBe(false);
    expect(shouldStartSpacePan(space, 'overlay', true)).toBe(false);
    expect(shouldStartSpacePan(space, 'keyboard', true)).toBe(false);
  });

  test('modifier chords and other keys never start a pan', () => {
    expect(shouldStartSpacePan({...space, ctrlKey: true}, 'neutral', true)).toBe(false);
    expect(shouldStartSpacePan({...space, metaKey: true}, 'neutral', true)).toBe(false);
    expect(shouldStartSpacePan({...space, altKey: true}, 'neutral', true)).toBe(false);
    expect(shouldStartSpacePan({...space, code: 'KeyP'}, 'neutral', true)).toBe(false);
  });
});

describe('startsOutsidePlanArea', () => {
  test('pans only with no units under the brush, outside block view', () => {
    expect(startsOutsidePlanArea(0, false)).toBe(true);
    expect(startsOutsidePlanArea(3, false)).toBe(false);
    expect(startsOutsidePlanArea(0, true)).toBe(false);
  });
});
