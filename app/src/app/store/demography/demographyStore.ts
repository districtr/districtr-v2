'use client';
import {useMapStore} from '../mapStore';
import {useMapControlsStore} from '../mapControlsStore';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {DemographyStore} from './types';
import {useAssignmentsStore} from '../assignmentsStore';
import {useCoiAssignmentsStore} from '../coiAssignmentsStore';
import {getDemography} from '@/app/utils/api/apiHandlers/getDemography';
import {demographyService} from '@/app/utils/demography/demographyService';
import {getAvailableColumnSets} from '@/app/utils/demography/getAvailableColumnSets';
import {DEFAULT_CHOROPLETH_BIN_COUNT} from './constants';

const getActiveBrokenIds = () => {
  const mapMode = useMapControlsStore.getState().mapMode;
  return Array.from(
    mapMode === 'coi'
      ? useCoiAssignmentsStore.getState().shatterIds.parents
      : useAssignmentsStore.getState().shatterIds.parents
  );
};

export var useDemographyStore = create(
  subscribeWithSelector<DemographyStore>((set, get) => ({
    getMapRef: () => undefined,
    setGetMapRef: getMapRef => {
      set({getMapRef});
      const {dataHash, setVariable, variable, setVariant, variant} = get();
      const {mapDocument} = useMapStore.getState();
      const currentDataHash = `${getActiveBrokenIds().join(',')}|${mapDocument?.document_id}`;
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
    availableColumnSets: {
      evaluation: {},
      map: {},
    },
    setAvailableColumnSets: availableColumnSets => {
      set({
        availableColumnSets: {
          ...get().availableColumnSets,
          ...availableColumnSets,
        },
      });
    },
    scale: undefined,
    setScale: scale => set({scale}),
    clear: () => {
      set({
        scale: undefined,
        dataHash: '',
      });
    },
    unmount: () => {
      const isSwappingMode = useMapControlsStore.getState().mapOptions.showDemographicMap;
      const currScale = get().scale;
      set({
        getMapRef: () => undefined,
        scale: isSwappingMode ? currScale : undefined,
      });
    },
    numberOfBins: DEFAULT_CHOROPLETH_BIN_COUNT,
    setNumberOfBins: numberOfBins => set({numberOfBins}),
    dataHash: '',
    setDataHash: dataHash => set({dataHash}),
    updateData: async (mapDocument, _brokenIds) => {
      const {dataHash: currDataHash} = get();
      const brokenIds = _brokenIds ?? getActiveBrokenIds();
      const {setErrorNotification} = useMapStore.getState();
      if (!mapDocument) return;
      // based on current map state
      const dataHash = `${brokenIds.join(',')}|${mapDocument.document_id}`;

      if (currDataHash === dataHash) return;
      const result = await getDemography({
        mapDocument,
        brokenIds,
      });
      if (!result || !mapDocument) {
        setErrorNotification({
          message: 'Failed to get demography',
          severity: 1,
          id: 'demography-get-error',
        });
        return;
      }
      if (mapDocument.access === 'read') {
        demographyService.updateOverlay(result.columns, result.results, dataHash);
      } else {
        demographyService.update(result.columns, result.results, dataHash);
      }
      set({
        availableColumnSets: getAvailableColumnSets(demographyService.availableColumns),
        dataHash,
      });
    },
  }))
);
