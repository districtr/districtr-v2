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
import {idb} from '@/app/utils/idb/idb';
import {
  CoalitionGroupKey,
  getCoalitionUniverseFromVariable,
  getSelectedCoalitionColumns,
  isCoalitionVariable,
} from '@/app/utils/demography/coalition';

let coalitionHydrationRequestId = 0;

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
    coalitionGroups: [],
    coalitionHash: '',
    coalitionRestoredSlug: null,
    restoreCoalition: async mapDocument => {
      const requestId = ++coalitionHydrationRequestId;
      const slug = mapDocument?.districtr_map_slug;
      if (!slug) {
        set({
          coalitionGroups: [],
          coalitionRestoredSlug: null,
          coalitionHash: `${performance.now()}`,
        });
        demographyCache.setCoalitionGroups([]);
        return;
      }
      if (get().coalitionRestoredSlug === slug) return;
      const saved = await idb.getCoalitionConfigBySlug(slug);
      const activeSlug = useMapStore.getState().mapDocument?.districtr_map_slug;
      if (requestId !== coalitionHydrationRequestId || activeSlug !== slug) return;
      const coalitionGroups = (saved?.selectedGroups ?? []) as CoalitionGroupKey[];
      set({
        coalitionGroups,
        coalitionRestoredSlug: slug,
        coalitionHash: `${performance.now()}`,
      });
      demographyCache.setCoalitionGroups(coalitionGroups);

      const currentVariable = get().variable;
      if (isCoalitionVariable(currentVariable)) {
        const universe = getCoalitionUniverseFromVariable(currentVariable);
        const selectedColumns = getSelectedCoalitionColumns({
          selectedGroups: coalitionGroups,
          availableColumns: demographyCache.availableColumns,
          universe,
        });
        if (!selectedColumns.length) {
          set({
            variable: universe === 'TOTPOP' ? 'total_pop_20' : 'total_vap_20',
          });
        }
      }
    },
    setCoalitionGroups: async coalitionGroups => {
      const deduped = coalitionGroups.filter((group, index, arr) => arr.indexOf(group) === index);
      set({
        coalitionGroups: deduped,
        coalitionHash: `${performance.now()}`,
      });
      demographyCache.setCoalitionGroups(deduped);

      const {mapDocument} = useMapStore.getState();
      if (mapDocument?.districtr_map_slug) {
        await idb.upsertCoalitionConfigBySlug({
          districtr_map_slug: mapDocument.districtr_map_slug,
          selectedGroups: deduped,
        });
      }

      const currentVariable = get().variable;
      if (isCoalitionVariable(currentVariable)) {
        const universe = getCoalitionUniverseFromVariable(currentVariable);
        const selectedColumns = getSelectedCoalitionColumns({
          selectedGroups: deduped,
          availableColumns: demographyCache.availableColumns,
          universe,
        });
        if (!selectedColumns.length) {
          set({
            variable: universe === 'TOTPOP' ? 'total_pop_20' : 'total_vap_20',
          });
        }
      }
    },
    resetCoalition: () => {
      set({
        coalitionGroups: [],
        coalitionRestoredSlug: null,
        coalitionHash: `${performance.now()}`,
      });
      demographyCache.setCoalitionGroups([]);
    },
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
        coalitionGroups: [],
        coalitionRestoredSlug: null,
        coalitionHash: `${performance.now()}`,
      });
      demographyCache.setCoalitionGroups([]);
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
