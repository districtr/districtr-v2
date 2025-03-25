import { MutationObserver } from '@tanstack/query-core';
import { queryClient } from '../queryClient';
import { getLoadPlanFromShare, getAssignments } from '../apiHandlers';
import { useMapStore } from '@/app/store/mapStore';
import type { AxiosError } from 'axios';

export interface AxiosErrorData {
  detail: 'Invalid password' | 'Password required';
}

export const sharedDocument = new MutationObserver(queryClient, {
  mutationFn: getLoadPlanFromShare,
  onMutate: ({
    token,
    password,
    status,
    access,
  }: {
    token: string;
    password: string | null;
    status: string | null;
    access: string;
  }) => {
    const passwordRequired = useMapStore.getState().passwordPrompt;
    useMapStore.getState().setAppLoadingState('loading');
  },
  onError: error => {
    const errorData = (error as AxiosError)?.response?.data as AxiosErrorData;
    if (errorData.detail === 'Invalid password') {
      useMapStore.getState().setShareMapMessage('Error: Incorrect password. Please try again');
    } else if (errorData.detail === 'Password required') {
      useMapStore
        .getState()
        .setShareMapMessage(
          'This document requires a password to view. Please enter a valid password'
        );
    }
  },
  onSuccess: data => {
    const {mapDocument, setMapDocument, setLoadedMapId, setAppLoadingState, setPasswordPrompt} =
      useMapStore.getState();
    useMapStore.getState().setLoadedMapId('');
    getAssignments(data);
    if (!mapDocument) {
      setMapDocument(data);
    }
    setAppLoadingState('loaded');
    setPasswordPrompt(false);
    if (data.status !== 'locked') {
      const documentUrl = new URL(window.location.toString());
      documentUrl.searchParams.delete('share'); // remove share + token from url
      documentUrl.searchParams.set('document_id', data.document_id);
      history.pushState({}, '', documentUrl.toString());
    }
  },
});