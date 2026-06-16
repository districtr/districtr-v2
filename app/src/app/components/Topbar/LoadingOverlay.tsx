'use client';
import React from 'react';
import {Flex, Spinner, Text} from '@radix-ui/themes';
import {EyeOpenIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {EvalTransitionOverlay} from './EvalTransitionOverlay';
import {useViewTransition} from './useViewTransition';

// Delay before showing the loading/lock overlay so quick operations don't flash.
const BUSY_SHOW_DELAY_MS = 150;

/** Full-screen busy card: a spinner with a short message. */
const OverlayCard: React.FC<{
  message: string;
  icon?: React.ComponentType<{className?: string}>;
}> = ({message, icon: Icon}) => (
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
        {Icon && <Icon className="size-4 text-districtrBlue" />}
        <Text size="2" weight="medium">
          {message}
        </Text>
      </Flex>
    </Flex>
  </div>
);

/** Returns true only once `active` has been true continuously for `delayMs`. */
function useDelayed(active: boolean, delayMs: number) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return shown;
}

/**
 * Root-mounted overlay for every "map busy" state, in priority order:
 *  1. View transition into Evaluate — themed step sequence.
 *  2. View transition into Display — covers the load until the map is painted.
 *  3. Operation lock (save / revert / reset / copy / conflict resolution) — shows
 *     the lock reason.
 *  4. Document loading — generic "Loading map" while a document fetch is in flight.
 *
 * Transitions show immediately (intentional); loading/lock states wait a beat so
 * quick operations don't flash. Replaces the legacy MapLockShade.
 */
export const LoadingOverlay: React.FC = () => {
  const {viewTransition, step} = useViewTransition();
  const mapLock = useMapStore(state => state.mapLock);
  const documentLoading = useMapStore(state => state.loadingStates.documentLoading);

  const busy = Boolean(mapLock?.isLocked) || documentLoading;
  const showBusy = useDelayed(busy, BUSY_SHOW_DELAY_MS);

  if (viewTransition === 'evaluate') {
    return <EvalTransitionOverlay activeStep={step} />;
  }
  if (viewTransition === 'display') {
    return <OverlayCard icon={EyeOpenIcon} message="Loading display view…" />;
  }
  if (showBusy) {
    return <OverlayCard message={mapLock?.reason || 'Loading map…'} />;
  }
  return null;
};
