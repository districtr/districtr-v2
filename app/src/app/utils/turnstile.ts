/**
 * Cloudflare Turnstile script loader + types, shared by the visible
 * comment-form widget and the invisible session widget. Both render
 * explicitly through window.turnstile.
 */

export type TurnstileRenderParams = {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, params: TurnstileRenderParams) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

export const loadTurnstile = (): Promise<void> => {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null; // allow retry on a later call
        reject(new Error('turnstile script failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
};
