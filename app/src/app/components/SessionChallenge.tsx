'use client';
import {useEffect, useRef, useState} from 'react';
import {Card, Flex, Portal, Text, Theme} from '@radix-ui/themes';
import {TURNSTILE_SESSION_SITE_KEY} from '../utils/api/constants';
import {loadTurnstile} from '../utils/turnstile';
import {useSessionChallengeStore} from '../store/sessionChallengeStore';

/**
 * Session captcha widget (Managed, interaction-only), activated via
 * requestTurnstileToken() in sessionChallengeStore. Normally runs silently
 * and off-screen; if Cloudflare requires interaction, a centered modal
 * surfaces explaining why, with the challenge inside.
 *
 * To test the interactive fallback locally, set
 * NEXT_PUBLIC_TURNSTILE_SESSION_SITE_KEY=3x00000000000000000000FF
 * (Cloudflare's "forces an interactive challenge" test key); the backend's
 * test secret key accepts the resulting token.
 */
export const SessionChallenge: React.FC = () => {
  const active = useSessionChallengeStore(state => !!state.resolve);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    let widgetId: string | undefined;
    const {finish, beginInteraction} = useSessionChallengeStore.getState();
    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SESSION_SITE_KEY,
          appearance: 'interaction-only',
          'before-interactive-callback': () => {
            setVisible(true);
            beginInteraction();
          },
          callback: finish,
          'error-callback': () => finish(null),
        });
      })
      .catch(() => finish(null));
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [active]);

  if (!active) return null;
  // Not a Radix Dialog: the widget container must stay mounted (and unmoved)
  // while the challenge runs silently, and Dialog unmounts closed content.
  //
  // Portal + nested Theme: the root <Theme> in layout.tsx gets
  // data-is-root-theme="true", which Radix's own CSS turns into
  // position:relative;z-index:0 — a stacking context that would otherwise
  // trap this overlay behind any open Dialog (Dialog.Content escapes the
  // same way, via its own Portal). pointerEvents:'auto' is needed too:
  // Dialog's DismissableLayer sets document.body.style.pointerEvents='none'
  // while open, and only its own Overlay/Content opt back in — this overlay
  // must opt in for itself or clicks pass through it while a dialog is open.
  return (
    <Portal>
      <Theme asChild>
        <Flex
          position="fixed"
          inset="0"
          align="center"
          justify="center"
          display={visible ? 'flex' : 'none'}
          style={{zIndex: 100000, background: 'var(--color-overlay)', pointerEvents: 'auto'}}
        >
          <Card size="3" m="4" style={{maxWidth: 400, textAlign: 'center'}}>
            <Text as="p" size="2" weight="medium" mb="4">
              Please verify you are a human.
              <br />
              This helps us keep Districtr free and open.
            </Text>
            <div ref={containerRef} />
          </Card>
        </Flex>
      </Theme>
    </Portal>
  );
};
