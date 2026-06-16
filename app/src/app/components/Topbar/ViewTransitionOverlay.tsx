'use client';
import React from 'react';
import {Flex, Spinner, Text} from '@radix-ui/themes';
import {EyeOpenIcon} from '@radix-ui/react-icons';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {
  EvalTransitionOverlay,
  EVAL_TRANSITION_STEPS,
  EVAL_STEP_DURATION_MS,
} from './EvalTransitionOverlay';

const DISPLAY_SETTLE_MS = 400; // linger briefly once the display view is active
const DISPLAY_MAX_MS = 5000; // hard cap so the overlay can never get stuck

/**
 * Root-mounted transition overlay shown while navigating into the display or
 * evaluate view. Navigation happens first (see ViewSwitcher); this overlay covers
 * the real load. Evaluate plays a short themed "speed bump" sequence; Display
 * shows a real-time loader that clears once the display view is active.
 */
export const ViewTransitionOverlay: React.FC = () => {
  const viewTransition = useMapControlsStore(state => state.viewTransition);
  const setViewTransition = useMapControlsStore(state => state.setViewTransition);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const isEval = useMapControlsStore(state => state.isEval);
  const [step, setStep] = React.useState(0);

  // Evaluate: step through the themed sequence (covers the load), then clear.
  React.useEffect(() => {
    if (viewTransition !== 'evaluate') return;
    setStep(0);
    const id = setInterval(() => {
      setStep(prev => {
        const next = prev + 1;
        if (next >= EVAL_TRANSITION_STEPS.length) {
          clearInterval(id);
          setViewTransition(null);
          return prev;
        }
        return next;
      });
    }, EVAL_STEP_DURATION_MS);
    return () => clearInterval(id);
  }, [viewTransition, setViewTransition]);

  // Display: clear shortly after the display view becomes active, with a hard cap.
  React.useEffect(() => {
    if (viewTransition !== 'display') return;
    const displayActive = !isEditing && !isEval;
    const delay = displayActive ? DISPLAY_SETTLE_MS : DISPLAY_MAX_MS;
    const id = setTimeout(() => setViewTransition(null), delay);
    return () => clearTimeout(id);
  }, [viewTransition, isEditing, isEval, setViewTransition]);

  if (!viewTransition) return null;
  if (viewTransition === 'evaluate') {
    return <EvalTransitionOverlay activeStep={step} />;
  }
  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-white/90 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <Flex
        direction="column"
        align="center"
        gap="3"
        className="rounded-xl border border-gray-200 bg-white px-8 py-6 shadow-xl"
      >
        <Spinner size="3" />
        <Flex align="center" gap="2">
          <EyeOpenIcon className="size-4 text-districtrBlue" />
          <Text size="2" weight="medium">
            Loading display view…
          </Text>
        </Flex>
      </Flex>
    </div>
  );
};
