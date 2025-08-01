'use client';
import React from 'react';
import {useMapStore} from '../store/mapStore';
import {Flex, Progress, Spinner, Text} from '@radix-ui/themes';

type LoadingState = {
  isLoadingDocument: boolean;
  isLoadingAssignments: boolean;
  isFetchingDocument: boolean;
  isFetchingAssignments: boolean;
};

export const MapLockShade: React.FC<{loadingState: LoadingState}> = ({loadingState}) => {
  const mapLock = useMapStore(state => state.mapLock);
  const stateIsLoading = useMapStore(state => state.appLoadingState === 'loading');
  const isLocked = mapLock || stateIsLoading || Object.values(loadingState).some(Boolean);
  if (!isLocked) {
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
        <Flex
          direction="column"
          align="center"
          justify="center"
          className={`${loadingState.isFetchingDocument ? 'opacity-100 h-auto p-4' : 'opacity-0 h-0 p-0'} 
        transition-height delay-500
        transition-opacity rounded-md shdadow-xl duration-1000 bg-white `}
          // 1000ms delay on height transition, 0 duration
        >
          <Text>Loading map metadata...</Text>
          <RandomProgressBar isLoading={loadingState.isFetchingDocument} />
        </Flex>
        <Flex
          direction="column"
          align="center"
          justify="center"
          className={`${loadingState.isFetchingAssignments ? 'opacity-100 h-auto p-4' : 'opacity-0 h-0 p-0'}
        transition-height delay-500
        transition-opacity rounded-md shdadow-xl duration-1000 bg-white `}
        >
          <Text>Loading district assignments...</Text>
          <RandomProgressBar isLoading={loadingState.isFetchingAssignments} duration="20s" />
        </Flex>
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
