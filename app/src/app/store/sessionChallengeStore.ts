import {create} from 'zustand';

// Bounded wait for the silent path; once a visible challenge is up, give the
// user time to complete it instead.
const SILENT_TIMEOUT_MS = 20 * 1000;
const INTERACTIVE_TIMEOUT_MS = 2 * 60 * 1000;

let timer: ReturnType<typeof setTimeout>;

type SessionChallengeState = {
  /** Pending promise resolver; non-null while a challenge is active. */
  resolve: ((token: string | null) => void) | null;
  finish: (token: string | null) => void;
  /** Cloudflare surfaced an interactive challenge: swap the short silent
   * timeout for a longer one so the user has time to complete it. */
  beginInteraction: () => void;
};

export const useSessionChallengeStore = create<SessionChallengeState>((set, get) => ({
  resolve: null,
  finish: token => {
    clearTimeout(timer);
    get().resolve?.(token);
    set({resolve: null});
  },
  beginInteraction: () => {
    clearTimeout(timer);
    timer = setTimeout(() => get().finish(null), INTERACTIVE_TIMEOUT_MS);
  },
}));

/**
 * Resolve a session Turnstile token by activating the <SessionChallenge />
 * component mounted in the root layout. Resolves null on timeout, error, or
 * if the component is not mounted. Callers (session.ts) single-flight this,
 * so at most one challenge is active at a time.
 */
export const requestTurnstileToken = (): Promise<string | null> =>
  new Promise(resolve => {
    useSessionChallengeStore.setState({resolve});
    timer = setTimeout(() => useSessionChallengeStore.getState().finish(null), SILENT_TIMEOUT_MS);
  });
