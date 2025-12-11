'use client';
import {useMapStore} from '../mapStore';
import {useMapControlsStore} from '../mapControlsStore';
import {create} from 'zustand';
import {subscribeWithSelector} from 'zustand/middleware';
import {DemographyStore} from './types';
import {useAssignmentsStore} from '../assignmentsStore';
import {getDemography} from '@/app/utils/api/apiHandlers/getDemography';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {AllEvaluationConfigs, AllMapConfigs} from '@/app/utils/api/summaryStats';
import {evalColumnConfigs} from './evaluationConfig';
import {choroplethMapVariables} from './constants';

export var useDemographyStore = create(
  subscribeWithSelector<DemographyStore>((set, get) => ({
    getMapRef: () => undefined,
    setGetMapRef: getMapRef => {
      set({getMapRef});
      const {dataHash, setVariable, variable, setVariant, variant} = get();
      const {mapDocument} = useMapStore.getState();
      const {shatterIds} = useAssignmentsStore.getState();
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
    numberOfBins: 5,
    setNumberOfBins: numberOfBins => set({numberOfBins}),
    dataHash: '',
    setDataHash: dataHash => set({dataHash}),
    updateData: async (mapDocument, _brokenIds) => {
      const {dataHash: currDataHash} = get();
      const {shatterIds: _shatterIds} = useAssignmentsStore.getState();
      const brokenIds = _brokenIds ?? Array.from(_shatterIds.parents);
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
      demographyCache.update(result.columns, result.results, dataHash);
      const availableColumns = demographyCache.availableColumns;
      const availableEvalSets: Record<string, AllEvaluationConfigs> = Object.fromEntries(
        Object.entries(evalColumnConfigs)
          .map(([columnsetKey, config]) => [
            columnsetKey,
            config.filter(entry => availableColumns.includes(entry.sourceCol ?? entry.column)),
          ])
          .filter(([, config]) => config.length > 0)
      );
      const availableMapSets: Record<string, AllMapConfigs> = Object.fromEntries(
        Object.entries(choroplethMapVariables)
          .map(([columnsetKey, config]) => [
            columnsetKey,
            config.filter(entry => availableColumns.includes(entry.value)),
          ])
          .filter(([, config]) => config.length > 0)
      );

      set({
        availableColumnSets: {
          evaluation: availableEvalSets,
          map: availableMapSets,
        },
        dataHash,
      });
    },
  }))
);
