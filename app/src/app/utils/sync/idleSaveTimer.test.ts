/**
 * Autosave waits for the user to go idle, but never longer than the cap.
 * Run with `bun test`.
 */
import {afterEach, beforeEach, describe, expect, jest, test} from 'bun:test';
import {AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS} from '@constants/document/sync';
import {createIdleSaveTimer} from './idleSaveTimer';

const SECOND = 1000;

describe('createIdleSaveTimer', () => {
  // Fake timers also move Date.now(), which the timer reads.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('interaction delays the save until the user goes idle', () => {
    let fired = 0;
    const timer = createIdleSaveTimer(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS, () => fired++);
    timer.arm();
    for (let i = 0; i < 6; i++) {
      jest.advanceTimersByTime(10 * SECOND);
      timer.activity();
    }
    expect(fired).toBe(0);
    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(fired).toBe(1);
  });

  test('the cap forces a save while interaction never stops', () => {
    let fired = 0;
    const timer = createIdleSaveTimer(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS, () => fired++);
    timer.arm();
    for (let t = 0; t < AUTOSAVE_MAX_WAIT_MS; t += SECOND) {
      jest.advanceTimersByTime(SECOND);
      expect(fired).toBe(t + SECOND < AUTOSAVE_MAX_WAIT_MS ? 0 : 1);
      timer.activity();
    }
    timer.cancel();
  });

  test('cancel stops a pending save', () => {
    let fired = 0;
    const timer = createIdleSaveTimer(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS, () => fired++);
    timer.arm();
    timer.cancel();
    jest.advanceTimersByTime(AUTOSAVE_MAX_WAIT_MS);
    expect(fired).toBe(0);
  });
});
