import {MutationObserver} from '@tanstack/query-core';
import {queryClient} from '../queryClient';
import {checkoutMapDocument} from '../apiHandlers/checkoutMapDocument';
import {useMapStore} from '@/app/store/mapStore';
import type {AxiosError} from 'axios';

export interface AxiosErrorData {
  detail: 'Invalid password' | 'Password required';
}

export const checkoutDocument = new MutationObserver(queryClient, {
  mutationFn: checkoutMapDocument,
  onSuccess: data => {
    const {mapDocument, setMapStatus, upsertUserMap} = useMapStore.getState();
    if (!mapDocument) return;
    upsertUserMap({
      documentId: mapDocument.document_id,
      mapDocument: {...mapDocument, access: data.access, status: data.status},
    });
    setMapStatus({
      access: data.access,
      status: data.status,
    });
    // Navigate to edit mode after checkout
    window.location.href = `/map/edit/${mapDocument?.document_id}`;
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
    } else {
      console.log('error: ', errorData);
    }
  },
});
