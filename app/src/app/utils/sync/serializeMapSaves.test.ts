/**
 * Overlapping map saves send the same last_updated_at and the second gets a
 * 409 (a false conflict). Run with `bun test`.
 */
import {describe, expect, test} from 'bun:test';
import {serializeMapSaves} from './serializeMapSaves';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

describe('serializeMapSaves', () => {
  test('a second save waits for the first to finish', async () => {
    const events: string[] = [];
    const save = serializeMapSaves(async (name: string) => {
      events.push(`start ${name}`);
      await tick();
      events.push(`end ${name}`);
      return name;
    });

    const results = await Promise.all([save('autosave'), save('submit')]);

    expect(results).toEqual(['autosave', 'submit']);
    expect(events).toEqual(['start autosave', 'end autosave', 'start submit', 'end submit']);
  });

  test('a failed save does not block the next one', async () => {
    const save = serializeMapSaves(async (fail: boolean) => {
      await tick();
      if (fail) throw new Error('network');
      return 'saved';
    });

    const first = save(true);
    const second = save(false);

    await expect(first).rejects.toThrow('network');
    expect(await second).toBe('saved');
  });
});
