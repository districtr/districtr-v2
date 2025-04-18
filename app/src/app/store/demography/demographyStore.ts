'use client';
import {MapStore, useMapStore} from '../mapStore';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {updateDemography} from '../../utils/api/queries';
import {DemographyStore} from './types';

export var useDemographyStore = create(
  subscribeWithSelector<DemographyStore>((set, get) => ({
    getMapRef: () => undefined,
    setGetMapRef: getMapRef => {
      set({getMapRef});
      const {dataHash, setVariable, variable, setVariant, variant} = get();
      const {mapDocument, shatterIds} = useMapStore.getState();
      const currentDataHash = `${Array.from(shatterIds.parents).join(',')}|${mapDocument?.document_id}`;
      if (currentDataHash === dataHash) {
        // set variable triggers map render/update
        getMapRef()?.on('load', () => {
          setVariable(variable);
          setVariant(variant);
        });
      }
    },
    variable: 'total_pop_20',
    variant: 'percent',
    setVariable: variable => set({variable}),
    setVariant: variant => set({variant}),
    scale: undefined,
    setScale: scale => set({scale}),
    clear: () => {
      set({
        scale: undefined,
        dataHash: '',
      });
    },
    unmount: () => {
      set({
        getMapRef: () => undefined,
        scale: undefined,
        dataHash: '',
      });
    },
    numberOfBins: 5,
    setNumberOfBins: numberOfBins => set({numberOfBins}),
    dataHash: '',
    setDataHash: dataHash => set({dataHash}),
    updateData: async mapDocument => {
      const {dataHash: currDataHash} = get();
      const {shatterIds} = useMapStore.getState();
      if (!mapDocument) return;
      // based on current map state
      const dataHash = `${Array.from(shatterIds.parents).join(',')}|${mapDocument.document_id}`;
      if (currDataHash === dataHash) return;
      updateDemography({
        mapDocument,
        brokenIds: Array.from(shatterIds.parents),
        dataHash,
      });
    },
  }))
);
