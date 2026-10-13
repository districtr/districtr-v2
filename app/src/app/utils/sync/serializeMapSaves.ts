/**
 * Runs map saves one at a time.
 *
 * Every save PUTs the document's last_updated_at, and the server answers 409
 * when that is stale. Two overlapping saves send the same timestamp, so the
 * second fails and opens the conflict modal although nobody else edited the
 * map. This happened when Submit's pre-finalize save landed during the
 * autosave that a click into the Turnstile iframe starts, and when Save was
 * clicked mid-autosave.
 *
 * One queue serves every store's save (district and community maps share the
 * document), so a save waits for the one before it and then PUTs the fresh
 * timestamp. A failed save doesn't block the next.
 */
let tail: Promise<unknown> = Promise.resolve();

export function serializeMapSaves<Args extends unknown[], Result>(
  save: (...args: Args) => Promise<Result>
): (...args: Args) => Promise<Result> {
  return (...args) => {
    const run = tail.then(() => save(...args));
    tail = run.catch(() => undefined);
    return run;
  };
}
