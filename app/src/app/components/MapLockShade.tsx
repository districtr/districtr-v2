'use client';
import React, {useEffect, useLayoutEffect, useState} from 'react';
import {useMapStore} from '../store/mapStore';
import {Flex, Progress, Spinner, Text} from '@radix-ui/themes';
import {useVisibilityState} from '../hooks/useVisibilityState';
import {MapStore} from '../store/mapStore';

type LoadingState = {
  isLoadingDocument: boolean;
  isLoadingAssignments: boolean;
  isFetchingDocument: boolean;
  isFetchingAssignments: boolean;
};

export const MapLockShade: React.FC<{loadingState: LoadingState; mapLock: MapStore['mapLock']}> = ({
  loadingState,
  mapLock,
}) => {
  const stateIsLoading = useMapStore(state => state.appLoadingState === 'loading');
  const isLocked = mapLock?.isLocked || stateIsLoading || Object.values(loadingState).some(Boolean);

  // Prevent flash up on first render before state is finalized
  const {isVisible} = useVisibilityState();
  const [showShade, setShowShade] = useState(false);
  useLayoutEffect(() => {
    if (isVisible) {
      setTimeout(() => {
        setShowShade(true);
      }, 125);
    } else {
      setShowShade(false);
    }
  }, [isVisible, isLocked]);

  if (!isVisible || !isLocked || !showShade) {
    return null;
  }
  return (
    <Flex
      direction="column"
      style={{
        opacity: isLocked ? 1 : 0,
      }}
      align="center"
      justify="center"
      className="flex absolute size-full bg-white/25 pointer-events-none z-[100] transition-[150ms] delay-150"
    >
      <Flex className="rounded-full shadow-xl bg-white p-4">
        <Spinner size="3" />
      </Flex>
      <Flex direction="column" align="center" justify="center" className="m-4 w-60 h-auto" gap="2">
        {mapLock?.reason ? (
          <Flex
            direction="column"
            align="center"
            justify="center"
            className={`opacity-100 h-auto p-4 transition-height delay-500 transition-opacity rounded-md shdadow-xl duration-1000 bg-white text-center`}
            // 1000ms delay on height transition, 0 duration
          >
            <Text>{mapLock.reason}</Text>
            <RandomProgressBar isLoading={mapLock.isLocked} />
          </Flex>
        ) : (
          <>
            <Flex
              direction="column"
              align="center"
              justify="center"
              className={`opacity-100 h-auto p-4 transition-height delay-500 transition-opacity rounded-md shdadow-xl duration-1000 bg-white `}
              // 1000ms delay on height transition, 0 duration
            >
              <Text>Loading map metadata...</Text>
              <RandomProgressBar isLoading={loadingState.isFetchingDocument} />
            </Flex>
            <Flex
              direction="column"
              align="center"
              justify="center"
              className={`opacity-100 h-auto p-4 transition-height delay-500 transition-opacity rounded-md shdadow-xl duration-1000 bg-white`}
            >
              <Text>Loading district assignments...</Text>
              <RandomProgressBar isLoading={loadingState.isFetchingAssignments} duration="20s" />
            </Flex>
          </>
        )}
      </Flex>
    </Flex>
  );
};

const RandomProgressBar: React.FC<{
  isLoading: boolean;
  duration?: `${number}s` | `${number}ms`;
}> = ({isLoading, duration = '5s'}) => {
  if (isLoading) {
    return <Progress duration={duration} color="blue" className="w-full" />;
  }
  return <Progress value={100} color="green" className="w-full" />;
};
