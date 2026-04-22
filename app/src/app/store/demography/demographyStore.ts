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
import {idb} from '@/app/utils/idb/idb';
import {
  CoalitionGroupKey,
  getCoalitionUniverseFromVariable,
  getSelectedCoalitionColumns,
  isCoalitionVariable,
} from '@/app/utils/demography/coalition';

let coalitionHydrationRequestId = 0;
let coalitionVersion = 0;
// Request-id for updateData so rapid successive calls don't clobber each other:
// two calls with different dataHashes both pass the cache guard, both fetch, and
// the late resolver would otherwise win and leave the demographyService singleton
// out of sync with the store's dataHash.
let updateDataRequestId = 0;

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
          coalitionHash: `${++coalitionVersion}`,
        });
        demographyService.updatePopulations();
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
        coalitionHash: `${++coalitionVersion}`,
      });
      demographyService.updatePopulations({coalitionGroups});

      const currentVariable = get().variable;
      if (isCoalitionVariable(currentVariable)) {
        const universe = getCoalitionUniverseFromVariable(currentVariable);
        const selectedColumns = getSelectedCoalitionColumns({
          selectedGroups: coalitionGroups,
          availableColumns: demographyService.availableColumns,
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
      const deduped = [...new Set(coalitionGroups)];
      set({
        coalitionGroups: deduped,
        coalitionHash: `${++coalitionVersion}`,
      });
      demographyService.updatePopulations({coalitionGroups: deduped});

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
          availableColumns: demographyService.availableColumns,
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
        coalitionHash: `${++coalitionVersion}`,
      });
      demographyService.updatePopulations();
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
        coalitionHash: `${++coalitionVersion}`,
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

      const requestId = ++updateDataRequestId;
      const result = await getDemography({
        mapDocument,
        brokenIds,
      });
      // Bail if a newer updateData call has already been kicked off; otherwise this
      // stale resolver would overwrite the fresh data with its own older results.
      if (requestId !== updateDataRequestId) return;
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
        demographyService.update(result.columns, result.results, dataHash, get().coalitionGroups);
      }

      set({
        availableColumnSets: getAvailableColumnSets(demographyService.availableColumns),
        dataHash,
      });
    },
  }))
);
