import {API_URL, TURNSTILE_SESSION_SITE_KEY} from './constants';
import {loadTurnstile} from '../turnstile';

/**
 * Silent captcha session tokens. The backend mints a session token from an
 * invisible Cloudflare Turnstile token (POST /api/session) and gated endpoints
 * require it in the X-Districtr-Session header. Everything here is
 * best-effort: any failure (script blocked, Cloudflare down, backend error)
 * yields null and the request proceeds without the header.
 */

const STORAGE_KEY = 'districtr_session';
// Refresh when within 5 minutes of expiry.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

type CachedSession = {token: string; expiresAt: number};

let cached: CachedSession | null = null;
let inflight: Promise<string | null> | null = null;

const isFresh = (session: CachedSession | null): session is CachedSession =>
  !!session && session.expiresAt - EXPIRY_BUFFER_MS > Date.now();

const readStorage = (): CachedSession | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.token === 'string' && typeof parsed?.expiresAt === 'number') {
      return parsed;
    }
  } catch {
    // ignore storage/parse errors
  }
  return null;
};

const writeStorage = (session: CachedSession) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors (private mode, quota)
  }
};

/** Render the invisible session widget off-DOM-flow and resolve its token. */
const getTurnstileToken = (): Promise<string | null> =>
  new Promise(resolve => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let widgetId: string | undefined;
    const finish = (token: string | null) => {
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
      container.remove();
      resolve(token);
    };
    try {
      widgetId = window.turnstile!.render(container, {
        sitekey: TURNSTILE_SESSION_SITE_KEY,
        callback: finish,
        'error-callback': () => finish(null),
      });
    } catch {
      finish(null);
    }
  });

const mintSession = async (): Promise<string | null> => {
  try {
    await loadTurnstile();
    if (!window.turnstile) return null;
    const captchaToken = await getTurnstileToken();
    if (!captchaToken) return null;
    const response = await fetch(`${API_URL || ''}/api/session`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      // recaptcha_token: wire name kept from the reCAPTCHA era
      body: JSON.stringify({recaptcha_token: captchaToken}),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const expiresAt = Date.parse(data.expires_at);
    if (typeof data.token !== 'string' || isNaN(expiresAt)) return null;
    cached = {token: data.token, expiresAt};
    writeStorage(cached);
    return cached.token;
  } catch {
    return null;
  }
};

/**
 * Get a session token for the X-Districtr-Session header, minting one via
 * invisible Turnstile if needed. Never throws; returns null on any failure,
 * on the server, or when no site key is configured.
 */
export async function getSessionToken(): Promise<string | null> {
  if (typeof window === 'undefined' || !TURNSTILE_SESSION_SITE_KEY) return null;
  if (isFresh(cached)) return cached.token;
  const stored = readStorage();
  if (isFresh(stored)) {
    cached = stored;
    return stored.token;
  }
  if (!inflight) {
    inflight = mintSession().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * fetch() that attaches the X-Districtr-Session header when a token is
 * available and, on a 401 {"detail": "session_required"} response, re-mints
 * the session and retries the request once.
 */
export async function fetchWithSession(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await getSessionToken();
  if (token) headers.set('X-Districtr-Session', token);
  const response = await fetch(url, {...init, headers});
  if (response.status !== 401) return response;
  const detail = await response
    .clone()
    .json()
    .then(error => error?.detail)
    .catch(() => null);
  if (detail !== 'session_required') return response;
  clearSessionToken();
  const freshToken = await getSessionToken();
  if (!freshToken) return response;
  headers.set('X-Districtr-Session', freshToken);
  return fetch(url, {...init, headers});
}

/** Clear the cached session token (used when the backend rejects it). */
export function clearSessionToken() {
  cached = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
}
