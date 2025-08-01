import {QueryObserver} from '@tanstack/react-query';
import {queryClient} from './queryClient';
import {DistrictrMap, DocumentObject} from './apiHandlers/types';

import {getAvailableDistrictrMaps} from '@utils/api/apiHandlers/getAvailableDistrictrMaps';
import {getDemography} from '@utils/api/apiHandlers/getDemography';
import {useMapStore} from '@/app/store/mapStore';
import {demographyCache} from '../demography/demographyCache';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {AllEvaluationConfigs, AllMapConfigs, AllTabularColumns} from './summaryStats';
import {ColumnarTableData} from '../ParquetWorker/parquetWorker.types';
import {evalColumnConfigs} from '@/app/store/demography/evaluationConfig';
import {choroplethMapVariables} from '@/app/store/demography/constants';

const INITIAL_VIEW_LIMIT = 30;
const INITIAL_VIEW_OFFSET = 0;

const mapViewsQuery = new QueryObserver<DistrictrMap[]>(queryClient, {
  queryKey: ['views', INITIAL_VIEW_LIMIT, INITIAL_VIEW_OFFSET],
  queryFn: () =>
    getAvailableDistrictrMaps({limit: INITIAL_VIEW_LIMIT, offset: INITIAL_VIEW_OFFSET}),
});

const updateMapViews = (limit: number, offset: number) => {
  mapViewsQuery.setOptions({
    queryKey: ['views', limit, offset],
    queryFn: () => getAvailableDistrictrMaps({limit, offset}),
  });
};

const getQueriesResultsSubs = (_useMapStore: typeof useMapStore) => {
  return mapViewsQuery.subscribe(result => {
    if (result) {
      _useMapStore.getState().setMapViews(result);
    }
  });
};

const fetchDemography = new QueryObserver<null | {
  columns: AllTabularColumns[number][];
  results: ColumnarTableData;
}>(queryClient, {
  queryKey: ['demography'],
  queryFn: async () => {
    const state = useMapStore.getState();
    const mapDocument = state.mapDocument;
    if (!mapDocument) {
      throw new Error('No map document found');
    }
    const brokenIds = Array.from(state.shatterIds.parents);
    return await getDemography({
      mapDocument,
      brokenIds,
    });
  },
});

export const updateDemography = ({
  mapDocument,
  brokenIds,
  dataHash,
}: {
  mapDocument: DocumentObject;
  brokenIds?: string[];
  dataHash: string;
}) => {
  fetchDemography.setOptions({
    queryFn: async () => {
      return await getDemography({
        mapDocument,
        brokenIds,
      });
    },
    queryKey: ['demography', performance.now()],
  });
};

fetchDemography.subscribe(demography => {
  if (demography.data) {
    const {setDataHash, setAvailableColumnSets} = useDemographyStore.getState();
    const {shatterIds, mapDocument} = useMapStore.getState();
    const dataHash = `${Array.from(shatterIds.parents).join(',')}|${mapDocument?.document_id}`;
    const result = demography.data;
    if (!mapDocument || !result) return;
    demographyCache.update(result.columns, result.results, dataHash);
    const availableColumns = demographyCache?.table?.columnNames() ?? [];
    const availableEvalSets: Record<string, AllEvaluationConfigs> = Object.fromEntries(
      Object.entries(evalColumnConfigs)
        .map(([columnsetKey, config]) => [
          columnsetKey,
          config.filter(entry => availableColumns.includes(entry.column)),
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
    setDataHash(dataHash);
    setAvailableColumnSets({
      evaluation: availableEvalSets,
      map: availableMapSets,
    });
  }
});

export {updateMapViews, getQueriesResultsSubs, mapViewsQuery, fetchDemography};
