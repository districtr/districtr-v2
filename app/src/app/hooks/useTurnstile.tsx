'use client';
import {TURNSTILE_SITE_KEY} from '../utils/api/constants';
import {loadTurnstile} from '../utils/turnstile';
import {Text} from '@radix-ui/themes';
import {useFormState} from '../store/formState';
import {useEffect, useMemo, useRef} from 'react';

const TurnstileWidget: React.FC<{
  setCaptchaToken: (token: string) => void;
  captchaToken: string;
}> = ({setCaptchaToken, captchaToken}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: setCaptchaToken,
          'expired-callback': () => setCaptchaToken(''),
          'error-callback': () => setCaptchaToken(''),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (widgetIdRef.current !== undefined) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = undefined;
      }
    };
  }, [setCaptchaToken]);

  // Tokens are single-use: when the store clears the token after a submit,
  // reset the widget so a follow-up submission gets a fresh one.
  useEffect(() => {
    if (!captchaToken && widgetIdRef.current !== undefined) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [captchaToken]);

  if (!TURNSTILE_SITE_KEY) {
    return <Text color="red">Error: Captcha is disabled</Text>;
  }
  return <div ref={containerRef} />;
};

export const useTurnstile = () => {
  const setCaptchaToken = useFormState(state => state.setCaptchaToken);
  const captchaToken = useFormState(state => state.captchaToken);
  const Component = useMemo(() => {
    return <TurnstileWidget setCaptchaToken={setCaptchaToken} captchaToken={captchaToken} />;
  }, [setCaptchaToken, captchaToken]);
  return {
    TurnstileComponent: Component,
    captchaToken,
  };
};
