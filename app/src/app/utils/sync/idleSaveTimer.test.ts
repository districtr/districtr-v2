/**
 * Autosave waits for the user to go idle, but never longer than the cap.
 * Run with `bun test`.
 */
import {afterEach, beforeEach, describe, expect, jest, test} from 'bun:test';
import {AUTOSAVE_DEBOUNCE_MS as IDLE, AUTOSAVE_MAX_WAIT_MS as CAP} from '@constants/document/sync';
import {createIdleSaveTimer} from './idleSaveTimer';

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

  test('cancel stops a pending save', () => {
    const {counter, timer} = setup();
    timer.arm();
    timer.cancel();
    jest.advanceTimersByTime(CAP);
    expect(counter.fired).toBe(0);
  });
});
