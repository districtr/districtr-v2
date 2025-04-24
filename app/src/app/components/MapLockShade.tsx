'use client';
import React from 'react';
import {useMapStore} from '../store/mapStore';
import {Spinner} from '@radix-ui/themes';

export const MapLockShade: React.FC = () => {
  const mapLock = useMapStore(state => state.mapLock);
  const isLoading = useMapStore(state => state.appLoadingState === 'loading');
  const isLocked = mapLock || isLoading;
  return (
    <div
      style={{
        opacity: isLocked ? 1 : 0,
      }}
      className="flex justify-center items-center absolute w-full h-full bg-white bg-opacity-25 pointer-events-none z-[100] transition-[150ms] delay-150"
    >
      <div className="rounded-full shadow-xl bg-white p-4">
        <Spinner size="3" />
      </div>
    </div>
  );
};
