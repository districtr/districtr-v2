import React from 'react';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {EVAL_TRANSITION_STEPS, EVAL_STEP_DURATION_MS} from './EvalTransitionOverlay';

// Hard cap so the overlay can never get stuck if a load signal never arrives.
const MAX_TRANSITION_MS = 15000;

/**
 * Drives the view transition overlay. Animates the evaluate step sequence and clears
 * the overlay only once the destination view's data has actually loaded — display
 * waits for the map source, evaluate also waits for the metrics — so users never see
 * a blank map. Evaluate keeps a minimum "speed bump" duration, and a max timeout
 * guarantees the overlay can never stick.
 *
 * Returns the current transition (or null) and the active eval step for rendering.
 */
export function useViewTransition() {
  const viewTransition = useMapControlsStore(state => state.viewTransition);
  const setViewTransition = useMapControlsStore(state => state.setViewTransition);
  const publicSourceLoaded = useMapStore(state => state.loadingStates.publicSourceLoaded);
  const metricsLoaded = useMapStore(state => state.loadingStates.metricsLoaded);
  const [step, setStep] = React.useState(0);
  const [minElapsed, setMinElapsed] = React.useState(false);

  // Per transition: animate the eval steps, enforce the minimum duration, and arm
  // the safety timeout.
  React.useEffect(() => {
    if (!viewTransition) return;
    setStep(0);
    setMinElapsed(false);
    const isEval = viewTransition === 'evaluate';
    const minMs = isEval ? EVAL_TRANSITION_STEPS.length * EVAL_STEP_DURATION_MS : 0;
    const minTimer = setTimeout(() => setMinElapsed(true), minMs);
    const maxTimer = setTimeout(() => setViewTransition(null), MAX_TRANSITION_MS);
    const stepTimer = isEval
      ? setInterval(
          () => setStep(prev => Math.min(prev + 1, EVAL_TRANSITION_STEPS.length - 1)),
          EVAL_STEP_DURATION_MS
        )
      : undefined;
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
      if (stepTimer) clearInterval(stepTimer);
    };
  }, [viewTransition, setViewTransition]);

  // Clear once the destination view's data is loaded and the minimum has elapsed.
  React.useEffect(() => {
    if (!viewTransition || !minElapsed) return;
    const dataReady =
      viewTransition === 'evaluate' ? publicSourceLoaded && metricsLoaded : publicSourceLoaded;
    if (dataReady) setViewTransition(null);
  }, [viewTransition, minElapsed, publicSourceLoaded, metricsLoaded, setViewTransition]);

  return {viewTransition, step};
}
