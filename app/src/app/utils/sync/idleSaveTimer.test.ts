/**
 * Autosave waits for the user to go idle, but never longer than the cap.
 * Run with `bun test`.
 */
import {afterEach, beforeEach, describe, expect, jest, test} from 'bun:test';
import {
  AUTOSAVE_DEBOUNCE_MS as IDLE,
  AUTOSAVE_MAX_WAIT_MS as CAP,
  AUTOSAVE_TUNING_DEBOUNCE_MS as TUNING_IDLE,
} from '@constants/document/sync';
import {createIdleSaveTimer} from './idleSaveTimer';
import {countsAsActivity} from '@/app/hooks/useAutoSave';

// Well inside the idle wait, so this much activity always keeps the user "active".
const STEP = IDLE / 3;

describe('createIdleSaveTimer', () => {
  // Fake timers also move performance.now(), which the timer reads.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const setup = () => {
    const counter = {fired: 0};
    const timer = createIdleSaveTimer(IDLE, CAP, () => counter.fired++);
    return {counter, timer};
  };

  test('interaction delays the save until the user goes idle', () => {
    const {counter, timer} = setup();
    timer.arm();
    for (let i = 0; i < 6; i++) {
      jest.advanceTimersByTime(STEP);
      timer.activity();
    }
    expect(counter.fired).toBe(0);
    jest.advanceTimersByTime(IDLE);
    expect(counter.fired).toBe(1);
  });

  test('the cap forces a save while interaction never stops', () => {
    const {counter, timer} = setup();
    timer.arm();
    for (let t = STEP; t <= CAP + STEP; t += STEP) {
      jest.advanceTimersByTime(STEP);
      expect(counter.fired).toBe(t < CAP ? 0 : 1);
      timer.activity();
    }
    timer.cancel();
  });

  test('edits after the first do not push the cap back', () => {
    const {counter, timer} = setup();
    timer.arm();
    for (let t = STEP; t <= CAP + STEP; t += STEP) {
      jest.advanceTimersByTime(STEP);
      expect(counter.fired).toBe(t < CAP ? 0 : 1);
      timer.arm();
    }
    timer.cancel();
  });

  test('a later edit starts a new cycle after a save', () => {
    const {counter, timer} = setup();
    timer.arm();
    jest.advanceTimersByTime(IDLE);
    expect(counter.fired).toBe(1);
    timer.arm();
    jest.advanceTimersByTime(IDLE);
    expect(counter.fired).toBe(2);
  });

  test('after a save cancels the cycle, the cap counts from the next edit', () => {
    // The hook cancels when any other save (Save button, blur) lands.
    const {counter, timer} = setup();
    timer.arm();
    jest.advanceTimersByTime(STEP);
    timer.cancel();
    jest.advanceTimersByTime(STEP);
    timer.arm();
    for (let t = STEP; t <= CAP + STEP; t += STEP) {
      jest.advanceTimersByTime(STEP);
      expect(counter.fired).toBe(t < CAP ? 0 : 1);
      timer.activity();
    }
    timer.cancel();
  });

  test('a postponed save fires shortly after, without a new cap', () => {
    // The hook postpones a save that comes due mid-brushstroke.
    const counter = {fired: 0};
    const timer = createIdleSaveTimer(IDLE, CAP, () => {
      if (counter.fired++ === 0) timer.postpone(1000);
    });
    timer.arm();
    jest.advanceTimersByTime(IDLE);
    expect(counter.fired).toBe(1);
    timer.arm(); // the stroke ends and is ingested: still the same cycle
    timer.activity();
    jest.advanceTimersByTime(1000);
    expect(counter.fired).toBe(2);
  });

  test("the tuning view's wait: a save seconds after the last press", () => {
    const counter = {fired: 0};
    const timer = createIdleSaveTimer(TUNING_IDLE, CAP, () => counter.fired++);
    timer.arm();
    jest.advanceTimersByTime(TUNING_IDLE - 1000);
    timer.activity(); // a click
    jest.advanceTimersByTime(TUNING_IDLE - 1);
    expect(counter.fired).toBe(0);
    jest.advanceTimersByTime(1);
    expect(counter.fired).toBe(1);
  });

  test('opening the tuning view brings a pending save forward', () => {
    const {counter, timer} = setup();
    timer.arm();
    jest.advanceTimersByTime(TUNING_IDLE - 1000);
    timer.setIdle(TUNING_IDLE);
    expect(counter.fired).toBe(0);
    jest.advanceTimersByTime(1000);
    expect(counter.fired).toBe(1);
  });

  test('opening it once that wait has passed saves at once', () => {
    const {counter, timer} = setup();
    timer.arm();
    jest.advanceTimersByTime(TUNING_IDLE + 1000);
    timer.setIdle(TUNING_IDLE);
    expect(counter.fired).toBe(1);
  });

  test('closing the tuning view puts a pending save back to the full wait', () => {
    const counter = {fired: 0};
    const timer = createIdleSaveTimer(TUNING_IDLE, CAP, () => counter.fired++);
    timer.arm();
    jest.advanceTimersByTime(1000);
    timer.setIdle(IDLE);
    jest.advanceTimersByTime(TUNING_IDLE);
    expect(counter.fired).toBe(0);
    jest.advanceTimersByTime(IDLE - TUNING_IDLE - 1000);
    expect(counter.fired).toBe(1);
  });

  test('changing the wait with nothing pending starts nothing', () => {
    const {counter, timer} = setup();
    timer.setIdle(TUNING_IDLE);
    jest.advanceTimersByTime(CAP);
    expect(counter.fired).toBe(0);
  });

  test('cancel stops a pending save', () => {
    const {counter, timer} = setup();
    timer.arm();
    timer.cancel();
    jest.advanceTimersByTime(CAP);
    expect(counter.fired).toBe(0);
  });
});

describe('countsAsActivity', () => {
  test('outside the tuning view, any input or map move pushes the save back', () => {
    for (const type of [
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'scroll',
      'touchstart',
      'move',
    ])
      expect(countsAsActivity(type, false)).toBe(true);
  });

  test('in the tuning view only presses do', () => {
    for (const type of ['pointerdown', 'keydown', 'touchstart'])
      expect(countsAsActivity(type, true)).toBe(true);
    for (const type of ['pointermove', 'wheel', 'scroll', 'move'])
      expect(countsAsActivity(type, true)).toBe(false);
  });
});
