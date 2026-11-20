/**
 * Fires `onFire` once the user has been idle for `idleMs` after pending
 * changes, or `maxWaitMs` after the first pending change, whichever is first.
 *
 * `arm()` marks changes pending (a no-op past the first until it fires);
 * `activity()` records an interaction. Activity only stamps a time, so a
 * continuous drag costs nothing: the one live timer checks the stamp when it
 * wakes and sleeps again for the remainder. `postpone(ms)` re-checks in `ms`
 * without starting a new cycle, for when a due save has to wait a moment.
 */
export function createIdleSaveTimer(idleMs: number, maxWaitMs: number, onFire: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline = 0;
  let lastActivity = 0;

  const check = () => {
    const now = performance.now();
    const due = Math.min(lastActivity + idleMs, deadline);
    if (now < due) {
      timer = setTimeout(check, due - now);
      return;
    }
    timer = undefined;
    onFire();
  };

  return {
    arm() {
      lastActivity = performance.now();
      if (timer !== undefined) return;
      deadline = lastActivity + maxWaitMs;
      timer = setTimeout(check, Math.min(idleMs, maxWaitMs));
    },
    activity() {
      lastActivity = performance.now();
    },
    postpone(ms: number) {
      clearTimeout(timer);
      deadline = performance.now() + ms;
      timer = setTimeout(check, ms);
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
