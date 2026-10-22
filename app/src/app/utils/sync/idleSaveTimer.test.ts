/**
 * Autosave waits for the user to go idle, but never longer than the cap.
 * Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {createIdleSaveTimer} from './idleSaveTimer';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('createIdleSaveTimer', () => {
  test('interaction delays the save until the user goes idle', async () => {
    let fired = 0;
    const timer = createIdleSaveTimer(50, 1000, () => fired++);
    timer.arm();
    for (let i = 0; i < 4; i++) {
      await wait(25);
      timer.activity();
    }
    expect(fired).toBe(0);
    await wait(80);
    expect(fired).toBe(1);
  });

  test('the cap forces a save while interaction never stops', async () => {
    let fired = 0;
    const timer = createIdleSaveTimer(50, 150, () => fired++);
    timer.arm();
    for (let i = 0; i < 10; i++) {
      await wait(20);
      timer.activity();
    }
    expect(fired).toBe(1);
    timer.cancel();
  });

  test('cancel stops a pending save', async () => {
    let fired = 0;
    const timer = createIdleSaveTimer(20, 100, () => fired++);
    timer.arm();
    timer.cancel();
    await wait(60);
    expect(fired).toBe(0);
  });
});
