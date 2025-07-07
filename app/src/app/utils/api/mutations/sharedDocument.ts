import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {getLoadPlanFromShare} from '../apiHandlers/getLoadPlanFromShare';
import {useMapStore} from '@/app/store/mapStore';
import type {AxiosError} from 'axios';

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
    const {setPasswordPrompt, setMapDocument} = useMapStore.getState();
    setPasswordPrompt(false);
    setMapDocument(data);
    // Navigate to appropriate mode based on access level
    if (data.access === 'edit') {
      window.location.href = `/map/edit/${data.document_id}`;
    } else if (data.access === 'read') {
      // For read-only access, check if we have a public_id to use for view mode
      const publicId = data.public_id || data.document_id;
      window.location.href = `/map/${publicId}`;
    }
  },
});
